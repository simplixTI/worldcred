import "server-only";
import { adminClient, rpc } from "@/lib/supabase/admin";
import { smsProvider } from "@/lib/sms";
import { pixProvider } from "@/lib/pix";
import { formatDateBR, withinWindow } from "@/lib/finance/dates";
import { getCollectionSettings } from "./settings";
import { createPortalLink } from "./links";

/** Rotina de cobrança: enfileira (SQL), depois despacha mensagens devidas dentro da janela. */
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
    const r = await dispatchOne(m.id, cfg);
    if (r === "sent") sent++; else if (r === "failed") failed++; else skipped++;
  }
  return { sent, skipped, failed, outside_window: false };
}

type Cfg = Awaited<ReturnType<typeof getCollectionSettings>>;

async function dispatchOne(messageId: string, cfg: Cfg): Promise<"sent" | "failed" | "skipped"> {
  const db = adminClient();
  // trava otimista: só um despachante pega a mensagem
  const { data: m } = await db.from("message_queue").update({ status: "sending" }).eq("id", messageId).in("status", ["queued", "failed"]).select("*").maybeSingle();
  if (!m) return "skipped";
  if (m.channel === "whatsapp" && !cfg.whatsapp_authorized) {
    await db.from("message_queue").update({ status: "skipped", skip_reason: "WhatsApp não autorizado pelo provedor" }).eq("id", m.id);
    return "skipped";
  }
  // estado atualizado da parcela
  const { data: inst } = await db.from("installments").select("*, contracts(number, status, customer_id, customers(phone))").eq("id", m.installment_id).single();
  const contract = inst?.contracts as unknown as { number: string; status: string; customer_id: string; customers: { phone: string | null } } | undefined;
  if (!inst || inst.status === "paid" || inst.status === "cancelled" || contract?.status !== "active") {
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
  const { count: total } = await db.from("installments").select("id", { count: "exact", head: true }).eq("contract_id", inst.contract_id);
  const { url, tokenHash } = await createPortalLink(contract.customer_id, inst.id, 72);
  const body = cfg.template.replace("{{n}}", String(inst.number)).replace("{{total}}", String(total ?? "")).replace("{{due}}", formatDateBR(inst.due_date)).replace("{{link}}", url);
  const to = contract.customers?.phone || m.recipient;
  const r = await smsProvider().send(to, body);
  if (r.ok) {
    await db.from("message_queue").update({ status: "sent", attempts: m.attempts + 1, sent_at: new Date().toISOString(), provider: smsProvider().name, provider_message_id: r.providerMessageId, body, link_token_hash: tokenHash, recipient: to, last_error: null }).eq("id", m.id);
    return "sent";
  }
  const attempts = m.attempts + 1;
  const exhausted = attempts >= m.max_attempts;
  await db.from("message_queue").update({ status: "failed", attempts, last_error: r.error, body, recipient: to, next_attempt_at: exhausted ? null : new Date(Date.now() + attempts * 30 * 60_000).toISOString() }).eq("id", m.id);
  if (exhausted) {
    await db.from("collection_cases").insert({ installment_id: inst.id, contract_id: inst.contract_id, customer_id: contract.customer_id, reason: "message_failed", detail: `SMS ${m.stage} falhou ${attempts}x: ${r.error}` }).then(() => {});
  }
  return "failed";
}
