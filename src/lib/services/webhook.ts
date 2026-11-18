import "server-only";
import { adminClient, rpc } from "@/lib/supabase/admin";
import { pixProvider, type WebhookEvent } from "@/lib/pix";
import { redact } from "@/lib/utils/mask";

export interface WebhookOutcome { status: number; body: Record<string, unknown>; }

/**
 * Pipeline do webhook Pix:
 * 1) assinatura → 2) registro único do evento (idempotência) → 3) consulta de status no provedor
 * → 4) confronto de referência, valor e conta recebedora → 5) wc_apply_payment (transação).
 */
export async function processPixWebhook(rawBody: string, headers: Record<string, string | null>): Promise<WebhookOutcome> {
  const provider = pixProvider();
  const event = await provider.verifyWebhook(rawBody, headers);
  if (!event) {
    // registro best-effort da tentativa (sem dados do corpo); a resposta é 401 independentemente
    try {
      await adminClient().from("provider_events").insert({ provider: provider.name, external_id: `invalid_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, kind: "invalid_signature", payload: { size: rawBody.length }, signature_valid: false, processed_at: new Date().toISOString(), result: { error: "assinatura inválida" } });
    } catch { /* sem banco disponível: apenas responde */ }
    return { status: 401, body: { error: "assinatura inválida" } };
  }
  const db = adminClient();
  const { data: inserted, error } = await db.from("provider_events").insert({ provider: provider.name, external_id: event.externalId, kind: event.kind, reference: event.reference, payload: redact(event.raw as Record<string, unknown>), signature_valid: true }).select("id").maybeSingle();
  if (error) {
    if (error.code === "23505") return { status: 200, body: { outcome: "already_processed" } };
    throw new Error(error.message);
  }
  const eventId = inserted!.id as string;
  let result: Record<string, unknown>;
  try {
    result = await handle(event, eventId);
  } catch (e) {
    result = { outcome: "error", error: (e as Error).message };
    await db.from("provider_events").update({ processed_at: new Date().toISOString(), result }).eq("id", eventId);
    return { status: 500, body: result };
  }
  await db.from("provider_events").update({ processed_at: new Date().toISOString(), result }).eq("id", eventId);
  return { status: 200, body: result };
}

async function handle(event: WebhookEvent, eventId: string): Promise<Record<string, unknown>> {
  const provider = pixProvider();
  switch (event.kind) {
    case "charge.paid": {
      if (!event.reference) return { outcome: "ignored", reason: "sem referência" };
      // nunca confiar só no payload: consultar o provedor
      const st = await provider.getCharge(event.reference);
      if (st.status !== "paid") return { outcome: "ignored", reason: `provedor informa status ${st.status}` };
      const amount = st.paidAmountCents ?? event.amountCents;
      const e2e = st.endToEndId ?? event.endToEndId;
      if (!amount || !e2e) return { outcome: "ignored", reason: "provedor sem valor/endToEndId" };
      if (event.amountCents != null && event.amountCents !== amount) return { outcome: "ignored", reason: "valor do evento diverge do provedor" };
      return rpc("wc_apply_payment", {
        p_provider: provider.name, p_external_payment_id: e2e, p_reference: event.reference, p_amount_cents: amount,
        p_paid_at: st.paidAt ?? event.paidAt ?? new Date().toISOString(), p_provider_event_id: eventId, p_payer: null,
        p_receiver_account: st.receiverAccount ?? event.receiverAccount,
      });
    }
    case "charge.expired": {
      if (!event.reference) return { outcome: "ignored" };
      const st = await provider.getCharge(event.reference);
      if (st.status === "paid") return handle({ ...event, kind: "charge.paid" }, eventId);
      await adminClient().from("pix_charges").update({ status: "expired" }).eq("reference", event.reference).eq("status", "active");
      return { outcome: "charge_expired" };
    }
    case "refund": {
      if (!event.refundOf || !event.endToEndId || !event.amountCents) return { outcome: "ignored" };
      return rpc("wc_register_refund", { p_provider: provider.name, p_external_payment_id: event.refundOf, p_refund_id: event.endToEndId, p_amount_cents: event.amountCents, p_provider_event_id: eventId });
    }
    case "payout.confirmed":
    case "payout.failed": {
      if (!event.reference) return { outcome: "ignored" };
      const { data: d } = await adminClient().from("disbursements").select("id").eq("reference", event.reference).maybeSingle();
      if (!d) return { outcome: "ignored", reason: "desembolso desconhecido" };
      const { reconcileDisbursement } = await import("./disbursements");
      return reconcileDisbursement(d.id);
    }
    default:
      return { outcome: "ignored", reason: "tipo desconhecido" };
  }
}
