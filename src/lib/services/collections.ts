import "server-only";
import { adminClient, rpc } from "@/lib/supabase/admin";
import { providerFor, whatsappIsLive, type Channel } from "@/lib/messaging";
import { pixProvider } from "@/lib/pix";
import { withinWindow } from "@/lib/finance/dates";
import { getCollectionSettings } from "./settings";
import { buildInstallmentMessage, getWhatsAppSettings } from "./messages";

/** Rotina de cobrança: enfileira (SQL) e despacha as mensagens devidas dentro da janela. */
export async function runCollectionCycle(now: Date = new Date()) {
  const enqueued = await rpc<Record<string, unknown>>("wc_enqueue_reminders", {});
  const dispatched = await dispatchDueMessages(now);
  return { enqueued, dispatched };
}

export async function dispatchDueMessages(now: Date = new Date(), limit = 100) {
  const db = adminClient();
  const cfg = await getCollectionSettings();
  if (!withinWindow(now, cfg.window_start, cfg.window_end)) return { sent: 0, skipped: 0, failed: 0, outside_window: true };
  const { data: due } = await db.from("message_queue").select("*")
    .in("status", ["queued", "failed"]).lte("scheduled_for", now.toISOString())
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${now.toISOString()}`)
    .order("scheduled_for").limit(limit);
  let sent = 0, skipped = 0, failed = 0;
  for (const m of due ?? []) {
    if (m.attempts >= m.max_attempts) continue;
    const r = await dispatchOne(m.id);
    if (r === "sent") sent++; else if (r === "failed") failed++; else skipped++;
  }
  return { sent, skipped, failed, outside_window: false };
}

async function dispatchOne(messageId: string): Promise<"sent" | "failed" | "skipped"> {
  const db = adminClient();
  // trava otimista: só um despachante pega a mensagem
  const { data: m } = await db.from("message_queue").update({ status: "sending" }).eq("id", messageId).in("status", ["queued", "failed"]).select("*").maybeSingle();
  if (!m) return "skipped";
  const stage: string = m.stage;
  const isConfirmation = stage === "PAGO";

  const { data: inst } = await db.from("installments").select("*, contracts(status, customer_id, customers(phone))").eq("id", m.installment_id).single();
  const contract = inst?.contracts as unknown as { status: string; customer_id: string; customers: { phone: string | null } } | undefined;
  if (!inst || contract?.status === "cancelled") {
    await db.from("message_queue").update({ status: "skipped", skip_reason: "contrato indisponível" }).eq("id", m.id);
    return "skipped";
  }
  if (!isConfirmation) {
    if (inst.status === "paid" || inst.status === "cancelled") {
      await db.from("message_queue").update({ status: "skipped", skip_reason: "parcela não está mais em aberto" }).eq("id", m.id);
      return "skipped";
    }
    if (inst.in_review) {
      await db.from("message_queue").update({ status: "queued", next_attempt_at: new Date(Date.now() + 6 * 3600_000).toISOString() }).eq("id", m.id);
      return "skipped";
    }
    const { data: paused } = await db.from("collection_cases").select("id").eq("installment_id", inst.id).eq("status", "paused").limit(1);
    if (paused && paused.length) {
      await db.from("message_queue").update({ status: "queued", next_attempt_at: new Date(Date.now() + 6 * 3600_000).toISOString() }).eq("id", m.id);
      return "skipped";
    }
    // pagamento em processamento? confirma com o provedor antes de cobrar
    const { data: active } = await db.from("pix_charges").select("reference").eq("installment_id", inst.id).eq("status", "active").maybeSingle();
    if (active) {
      const st = await pixProvider().getCharge(active.reference).catch(() => null);
      if (st?.status === "paid") {
        await db.from("message_queue").update({ status: "queued", next_attempt_at: new Date(Date.now() + 3600_000).toISOString(), skip_reason: "pagamento identificado no provedor; aguardando baixa" }).eq("id", m.id);
        return "skipped";
      }
    }
  }

  // canal: WhatsApp quando autorizado e conectado; senão SMS (se o fallback estiver ligado)
  const cfg = await getCollectionSettings();
  const wa = await getWhatsAppSettings();
  let channel: Channel = (m.channel as Channel) ?? "sms";
  if (channel === "whatsapp" && (!wa.authorized || !whatsappIsLive())) {
    if (!cfg.fallback_sms) {
      await db.from("message_queue").update({ status: "skipped", skip_reason: wa.authorized ? "WhatsApp não conectado" : "WhatsApp não autorizado" }).eq("id", m.id);
      return "skipped";
    }
    channel = "sms";
  }

  const built = await buildInstallmentMessage(m.installment_id, stage, { withQr: channel === "whatsapp" && wa.send_qr_image && !isConfirmation });
  if ("skip" in built) {
    await db.from("message_queue").update({ status: "skipped", skip_reason: built.skip }).eq("id", m.id);
    return "skipped";
  }

  const to = contract?.customers?.phone || m.recipient;
  const provider = providerFor(channel);
  // SMS é curto: manda só o essencial com o link
  const smsText = `WorldCred: parcela ${inst.number} ${stage === "PAGO" ? "paga, obrigado!" : `de ${(Number(inst.amount_cents) - Number(inst.paid_cents)) / 100 >= 0 ? "R$ " + ((Number(inst.amount_cents) - Number(inst.paid_cents)) / 100).toFixed(2).replace(".", ",") : ""}`}. ${built.link}`;

  let r = built.imageBase64
    ? await provider.sendImage(to, built.imageBase64, built.text, `pix-parcela-${inst.number}.png`)
    : await provider.sendText(to, channel === "sms" ? smsText : built.text);

  // segunda mensagem com o copia e cola, para o cliente tocar e copiar
  if (r.ok && channel === "whatsapp" && wa.send_copy_paste && built.copyPaste && !isConfirmation) {
    await provider.sendText(to, built.copyPaste).catch(() => undefined);
  }

  // WhatsApp indisponível para este número: tenta SMS na hora
  if (!r.ok && channel === "whatsapp" && cfg.fallback_sms) {
    const sms = providerFor("sms");
    const r2 = await sms.sendText(to, smsText);
    if (r2.ok) {
      await db.from("message_queue").update({ status: "sent", channel: "sms", attempts: m.attempts + 1, sent_at: new Date().toISOString(), provider: sms.name, provider_message_id: r2.providerMessageId, sent_body: smsText, recipient: to, last_error: `WhatsApp falhou: ${r.error}` }).eq("id", m.id);
      return "sent";
    }
    r = { ok: false, error: `WhatsApp: ${r.error}; SMS: ${r2.error}` };
  }

  if (r.ok) {
    await db.from("message_queue").update({ status: "sent", attempts: m.attempts + 1, sent_at: new Date().toISOString(), provider: provider.name, provider_message_id: r.providerMessageId, sent_body: channel === "sms" ? smsText : built.text, recipient: to, last_error: null }).eq("id", m.id);
    return "sent";
  }

  const attempts = m.attempts + 1;
  const exhausted = attempts >= m.max_attempts;
  await db.from("message_queue").update({ status: "failed", attempts, last_error: r.error, recipient: to, next_attempt_at: exhausted ? null : new Date(Date.now() + attempts * 30 * 60_000).toISOString() }).eq("id", m.id);
  if (exhausted && !isConfirmation) {
    await db.from("collection_cases").insert({ installment_id: inst.id, contract_id: inst.contract_id, customer_id: contract!.customer_id, reason: "message_failed", detail: `${channel} ${stage} falhou ${attempts}x: ${r.error}` }).then(() => {}, () => {});
  }
  return "failed";
}
