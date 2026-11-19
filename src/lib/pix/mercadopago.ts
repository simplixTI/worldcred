import "server-only";

import type {
  ChargeResult, ChargeStatus, CreateChargeInput, KeyValidationResult, PayoutInput, PayoutResult, PixProvider, WebhookEvent,
} from "./types";
import { MockPixProvider } from "./mock";

/**
 * Cobranças Pix pelo Mercado Pago (API de pagamentos, payment_method_id = "pix").
 * - Recebimento das parcelas: real, na conta Mercado Pago da empresa; confirmação pelo webhook /api/webhooks/mercadopago.
 * - Pagamento de saída (desembolso) e consulta de chave: o MP não oferece por API; ficam no provedor simulado até o PSP (Inter).
 */
const API = "https://api.mercadopago.com";

function token() {
  const t = process.env.MP_ACCESS_TOKEN;
  if (!t) throw new Error("MP_ACCESS_TOKEN não configurado");
  return t;
}

export class MercadoPagoPixProvider implements PixProvider {
  readonly name = "mercadopago";
  readonly payouts = new MockPixProvider();
  private collector: string | null = null;

  private async collectorId(): Promise<string> {
    if (this.collector) return this.collector;
    const r = await fetch(`${API}/users/me`, { headers: { Authorization: `Bearer ${token()}` }, cache: "no-store" });
    const j = await r.json();
    this.collector = `MP-${j.id ?? "?"}`;
    return this.collector;
  }

  async createCharge(input: CreateChargeInput): Promise<ChargeResult> {
    const [first, ...rest] = input.payerName.trim().split(/\s+/);
    const expiresAt = new Date(Date.now() + input.expiresInSeconds * 1000);
    const res = await fetch(`${API}/v1/payments`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json", "X-Idempotency-Key": input.reference },
      body: JSON.stringify({
        transaction_amount: Number((input.amountCents / 100).toFixed(2)),
        description: input.description,
        payment_method_id: "pix",
        external_reference: input.reference,
        date_of_expiration: expiresAt.toISOString().replace("Z", "-00:00"),
        ...(String(process.env.NEXT_PUBLIC_APP_URL).startsWith("https://") ? { notification_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/mercadopago` } : {}),
        payer: { email: payerEmail(input.payerCpf), first_name: first, last_name: rest.join(" ") || first, identification: { type: "CPF", number: input.payerCpf.replace(/\D/g, "") } },
      }),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(`Mercado Pago ${res.status}: ${j.message ?? JSON.stringify(j).slice(0, 200)}`);
    const td = j.point_of_interaction?.transaction_data ?? {};
    return {
      providerChargeId: String(j.id), reference: input.reference, status: "active",
      qrPayload: td.qr_code ?? "", receiverAccount: `MP-${j.collector_id ?? (await this.collectorId()).replace("MP-", "")}`,
      expiresAt: j.date_of_expiration ? new Date(j.date_of_expiration).toISOString() : expiresAt.toISOString(), amountCents: input.amountCents,
    };
  }

  private async findByReference(reference: string): Promise<Record<string, unknown> | null> {
    const r = await fetch(`${API}/v1/payments/search?external_reference=${encodeURIComponent(reference)}&sort=date_created&criteria=desc`, { headers: { Authorization: `Bearer ${token()}` }, cache: "no-store" });
    if (!r.ok) return null;
    const j = await r.json();
    return (j.results?.[0] as Record<string, unknown>) ?? null;
  }

  async getCharge(reference: string): Promise<ChargeStatus> {
    const p = await this.findByReference(reference);
    if (!p) return { reference, status: "cancelled" };
    return mapPayment(reference, p);
  }

  async cancelCharge(reference: string): Promise<void> {
    const p = await this.findByReference(reference);
    if (!p || p.status !== "pending") return;
    await fetch(`${API}/v1/payments/${p.id}`, { method: "PUT", headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" }, body: JSON.stringify({ status: "cancelled" }) });
  }

  // ---- sem suporte no MP: delegados ao simulado (claramente sinalizado no admin) ----
  createPayout(input: PayoutInput): Promise<PayoutResult> { return this.payouts.createPayout(input); }
  getPayout(reference: string): Promise<PayoutResult> { return this.payouts.getPayout(reference); }
  validateKey(pixKey: string, expectedCpf: string): Promise<KeyValidationResult> { return this.payouts.validateKey(pixKey, expectedCpf); }

  /** Os webhooks do MP chegam em /api/webhooks/mercadopago (assinatura x-signature); esta rota não é usada. */
  async verifyWebhook(): Promise<WebhookEvent | null> { return null; }
}

/** Converte um pagamento Pix do MP para o status da cobrança. */
export function mapPayment(reference: string, p: Record<string, unknown>): ChargeStatus {
  const status = String(p.status);
  const exp = p.date_of_expiration ? new Date(String(p.date_of_expiration)) : null;
  const s: ChargeStatus["status"] = status === "approved" ? "paid" : status === "cancelled" || status === "rejected" ? "cancelled" : exp && exp < new Date() ? "expired" : "active";
  return {
    reference, status: s,
    paidAmountCents: status === "approved" ? Math.round(Number(p.transaction_amount) * 100) : undefined,
    endToEndId: status === "approved" ? `MP-${p.id}` : undefined,
    paidAt: (p.date_approved as string) ?? undefined,
    receiverAccount: `MP-${p.collector_id}`,
  };
}

function payerEmail(cpf: string) {
  return `pagador-${cpf.replace(/\D/g, "").slice(-6)}@worldcred.digital`;
}
