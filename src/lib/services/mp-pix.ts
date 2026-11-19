import "server-only";
import { adminClient, rpc } from "@/lib/supabase/admin";
import { getPayment } from "@/lib/card/mercadopago";

/**
 * Pagamento Pix recebido pelo Mercado Pago (cobrança de parcela): consulta o pagamento na API e aplica
 * a baixa pela função transacional (idempotente por id do pagamento). Estornos vão para conciliação.
 */
export async function syncPixPayment(paymentId: string): Promise<Record<string, unknown>> {
  const p = await getPayment(paymentId);
  if (!p) return { outcome: "payment_not_found", payment_id: paymentId };
  const raw = p as unknown as { payment_method_id?: string; collector_id?: number; external_reference?: string | null; transaction_amount: number; status: string; date_approved: string | null; id: string };
  if (raw.payment_method_id !== "pix") return { outcome: "not_pix" };
  if (!raw.external_reference) return { outcome: "ignored", reason: "sem referência" };
  const db = adminClient();
  const { data: charge } = await db.from("pix_charges").select("id, reference").eq("reference", raw.external_reference).maybeSingle();
  if (!charge) return { outcome: "unknown_reference", reference: raw.external_reference };
  if (raw.status === "approved") {
    return rpc("wc_apply_payment", {
      p_provider: "mercadopago", p_external_payment_id: `MP-${raw.id}`, p_reference: raw.external_reference, p_amount_cents: Math.round(raw.transaction_amount * 100),
      p_paid_at: raw.date_approved ?? new Date().toISOString(), p_provider_event_id: null, p_payer: null, p_receiver_account: `MP-${raw.collector_id}`,
    });
  }
  if (raw.status === "refunded" || raw.status === "charged_back") {
    return rpc("wc_register_refund", { p_provider: "mercadopago", p_external_payment_id: `MP-${raw.id}`, p_refund_id: `MP-${raw.id}-REF`, p_amount_cents: Math.round(raw.transaction_amount * 100), p_provider_event_id: null });
  }
  if (raw.status === "cancelled") {
    await db.from("pix_charges").update({ status: "expired" }).eq("id", charge.id).eq("status", "active");
    return { outcome: "charge_cancelled" };
  }
  return { outcome: "pending", status: raw.status };
}
