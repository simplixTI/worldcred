import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Mercado Pago — Checkout Pro (hospedado) + consulta de pagamento + validação de webhook.
 * Credenciais de TESTE em MP_ACCESS_TOKEN (TEST-...) para sandbox; em produção use as de produção.
 * Cartão completo e CVV nunca passam pela WorldCred: tudo acontece no checkout do Mercado Pago.
 */
const API = "https://api.mercadopago.com";

function token() {
  const t = process.env.MP_ACCESS_TOKEN;
  if (!t) throw new Error("MP_ACCESS_TOKEN não configurado");
  return t;
}

export interface PreferenceInput {
  externalReference: string; title: string; amountCents: number; installments: number; payerEmail: string; payerName?: string;
  backUrl: string; notificationUrl: string;
}

export async function createPreference(input: PreferenceInput): Promise<{ id: string; initPoint: string; sandboxInitPoint: string | null }> {
  const res = await fetch(`${API}/checkout/preferences`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json", "X-Idempotency-Key": input.externalReference },
    body: JSON.stringify({
      items: [{ id: input.externalReference, title: input.title, quantity: 1, unit_price: Number((input.amountCents / 100).toFixed(2)), currency_id: "BRL" }],
      payer: { email: input.payerEmail, name: input.payerName },
      payment_methods: { installments: input.installments, default_installments: input.installments, excluded_payment_types: [{ id: "ticket" }, { id: "bank_transfer" }, { id: "atm" }] },
      back_urls: { success: `${input.backUrl}?status=success`, pending: `${input.backUrl}?status=pending`, failure: `${input.backUrl}?status=failure` },
      auto_return: "approved",
      notification_url: input.notificationUrl,
      external_reference: input.externalReference,
      statement_descriptor: "WORLDCRED",
      binary_mode: true,
    }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`Mercado Pago ${res.status}: ${j.message ?? JSON.stringify(j).slice(0, 200)}`);
  return { id: j.id, initPoint: j.init_point, sandboxInitPoint: j.sandbox_init_point ?? null };
}

export interface MpPayment {
  id: string; status: string; status_detail: string; transaction_amount: number; installments: number; external_reference: string | null;
  date_approved: string | null; money_release_date: string | null; payment_type_id: string; card?: { last_four_digits?: string; first_six_digits?: string };
}

export async function getPayment(id: string): Promise<MpPayment> {
  const res = await fetch(`${API}/v1/payments/${id}`, { headers: { Authorization: `Bearer ${token()}` }, cache: "no-store" });
  if (!res.ok) throw new Error(`Mercado Pago ${res.status} ao consultar pagamento`);
  const j = await res.json();
  return { ...j, id: String(j.id) };
}

/** Valida x-signature (HMAC SHA256) conforme a documentação de webhooks do Mercado Pago. Sem segredo configurado, recusa. */
export function verifyWebhookSignature(headers: Record<string, string | null>, dataId: string | null): boolean {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) return false;
  const sig = headers["x-signature"] || ""; const reqId = headers["x-request-id"] || "";
  const parts = Object.fromEntries(sig.split(",").map((p) => { const [k, v] = p.trim().split("="); return [k, v]; }));
  const ts = parts.ts, v1 = parts.v1;
  if (!ts || !v1 || !dataId) return false;
  const manifest = `id:${dataId.toLowerCase()};request-id:${reqId};ts:${ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest("hex");
  const a = Buffer.from(expected), b = Buffer.from(v1);
  return a.length === b.length && timingSafeEqual(a, b);
}
