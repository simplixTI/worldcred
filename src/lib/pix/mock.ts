import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { adminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { detectPixKeyType, maskCPF, onlyDigits } from "@/lib/utils/mask";
import type {
  ChargeResult, ChargeStatus, CreateChargeInput, KeyValidationResult, PayoutInput, PayoutResult, PixProvider, WebhookEvent,
} from "./types";
import { PixTimeoutError } from "./types";

export const MOCK_RECEIVER_ACCOUNT = "WC-SANDBOX-001";

/**
 * Provedor Pix simulado para sandbox. Estado persistido em mock_pix_state.
 * Gatilhos determinísticos:
 *  - chave Pix contendo "invalida" → validação rejeitada
 *  - chave Pix contendo "timeout" → pagamento de saída lança tempo limite (resposta ambígua), mas fica pendente no provedor
 *  - chave Pix contendo "falha" → pagamento de saída falha
 */
export class MockPixProvider implements PixProvider {
  readonly name = "mock";

  async createCharge(input: CreateChargeInput): Promise<ChargeResult> {
    const db = adminClient();
    const expiresAt = new Date(Date.now() + input.expiresInSeconds * 1000).toISOString();
    const qrPayload = buildFakeEmv(input.reference, input.amountCents);
    const providerChargeId = `mockcob_${randomUUID().slice(0, 8)}`;
    const { error } = await db.from("mock_pix_state").upsert({
      kind: "charge", reference: input.reference, status: "active", amount_cents: input.amountCents,
      payload: { providerChargeId, expiresAt, qrPayload, receiverAccount: MOCK_RECEIVER_ACCOUNT, payer: { name: input.payerName, cpf: maskCPF(input.payerCpf) } },
    }, { onConflict: "kind,reference" });
    if (error) throw new Error(error.message);
    return { providerChargeId, reference: input.reference, status: "active", qrPayload, receiverAccount: MOCK_RECEIVER_ACCOUNT, expiresAt, amountCents: input.amountCents };
  }

  async getCharge(reference: string): Promise<ChargeStatus> {
    const { data } = await adminClient().from("mock_pix_state").select("*").eq("kind", "charge").eq("reference", reference).maybeSingle();
    if (!data) return { reference, status: "cancelled" };
    const p = data.payload as Record<string, unknown>;
    let status = data.status as ChargeStatus["status"];
    if (status === "active" && p.expiresAt && new Date(String(p.expiresAt)) < new Date()) status = "expired";
    return {
      reference, status,
      paidAmountCents: p.paidAmountCents as number | undefined,
      endToEndId: p.endToEndId as string | undefined,
      paidAt: p.paidAt as string | undefined,
      receiverAccount: MOCK_RECEIVER_ACCOUNT,
    };
  }

  async cancelCharge(reference: string): Promise<void> {
    await adminClient().from("mock_pix_state").update({ status: "cancelled" }).eq("kind", "charge").eq("reference", reference).eq("status", "active");
  }

  async createPayout(input: PayoutInput): Promise<PayoutResult> {
    const db = adminClient();
    const { data: existing } = await db.from("mock_pix_state").select("*").eq("kind", "payout").eq("reference", input.reference).maybeSingle();
    if (existing) return this.getPayout(input.reference); // idempotente por referência
    const key = input.pixKey.toLowerCase();
    if (key.includes("falha")) {
      await db.from("mock_pix_state").insert({ kind: "payout", reference: input.reference, status: "failed", amount_cents: input.amountCents, payload: { error: "chave destino recusada" } });
      return { reference: input.reference, providerTxId: null, status: "failed", error: "chave destino recusada" };
    }
    const txId = `E${Date.now()}${randomUUID().replace(/-/g, "").slice(0, 10)}`.toUpperCase();
    if (key.includes("timeout")) {
      // o provedor registra como pendente, mas a resposta não chega: cenário ambíguo
      await db.from("mock_pix_state").insert({ kind: "payout", reference: input.reference, status: "pending", amount_cents: input.amountCents, payload: { providerTxId: txId, settleAfter: new Date(Date.now() + 5000).toISOString() } });
      throw new PixTimeoutError();
    }
    const confirmedAt = new Date().toISOString();
    await db.from("mock_pix_state").insert({ kind: "payout", reference: input.reference, status: "confirmed", amount_cents: input.amountCents, payload: { providerTxId: txId, confirmedAt } });
    return { reference: input.reference, providerTxId: txId, status: "confirmed", confirmedAt };
  }

  async getPayout(reference: string): Promise<PayoutResult> {
    const db = adminClient();
    const { data } = await db.from("mock_pix_state").select("*").eq("kind", "payout").eq("reference", reference).maybeSingle();
    if (!data) return { reference, providerTxId: null, status: "failed", error: "referência desconhecida no provedor" };
    const p = data.payload as Record<string, unknown>;
    let status = data.status as PayoutResult["status"];
    if (status === "pending" && p.settleAfter && new Date(String(p.settleAfter)) <= new Date()) {
      status = "confirmed";
      const confirmedAt = new Date().toISOString();
      await db.from("mock_pix_state").update({ status, payload: { ...p, confirmedAt } }).eq("id", data.id);
      p.confirmedAt = confirmedAt;
    }
    return { reference, providerTxId: (p.providerTxId as string) ?? null, status, confirmedAt: p.confirmedAt as string | undefined, error: p.error as string | undefined };
  }

  async validateKey(pixKey: string, expectedCpf: string): Promise<KeyValidationResult> {
    const keyType = detectPixKeyType(pixKey);
    if (!keyType) return { valid: false, keyType: null, reason: "formato de chave não reconhecido" };
    if (pixKey.toLowerCase().includes("invalida")) return { valid: false, keyType, reason: "chave não encontrada no DICT" };
    const matches = keyType === "cpf" ? onlyDigits(pixKey) === onlyDigits(expectedCpf) : true;
    return { valid: matches, keyType, ownerNameMasked: "TITULAR S*****", ownerDocumentMasked: maskCPF(expectedCpf), ownerDocumentMatches: matches, reason: matches ? undefined : "titular da chave diverge do CPF cadastrado" };
  }

  async verifyWebhook(rawBody: string, headers: Record<string, string | null>): Promise<WebhookEvent | null> {
    const sig = headers["x-wc-signature"] || "";
    const expected = createHmac("sha256", env.pixWebhookSecret).update(rawBody).digest("hex");
    const a = Buffer.from(sig, "utf8"), b = Buffer.from(expected, "utf8");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const body = JSON.parse(rawBody) as Record<string, unknown>;
    return {
      externalId: String(body.eventId),
      kind: (body.kind as WebhookEvent["kind"]) ?? "unknown",
      reference: (body.reference as string) ?? null,
      amountCents: body.amountCents != null ? Number(body.amountCents) : null,
      endToEndId: (body.endToEndId as string) ?? null,
      paidAt: (body.paidAt as string) ?? null,
      receiverAccount: (body.receiverAccount as string) ?? null,
      refundOf: (body.refundOf as string) ?? null,
      providerTxId: (body.providerTxId as string) ?? null,
      raw: body,
    };
  }

  // ---------- Simulador (painel sandbox) ----------
  /** Marca a cobrança como paga no "provedor" e devolve o evento assinado para envio ao webhook. */
  async simulatePayment(reference: string, amountCents?: number, opts: { receiverAccount?: string; endToEndId?: string } = {}) {
    const db = adminClient();
    const { data } = await db.from("mock_pix_state").select("*").eq("kind", "charge").eq("reference", reference).maybeSingle();
    if (!data) throw new Error("cobrança não existe no provedor simulado");
    const p = data.payload as Record<string, unknown>;
    const amount = amountCents ?? Number(data.amount_cents);
    const endToEndId = opts.endToEndId ?? `E${Date.now()}${randomUUID().replace(/-/g, "").slice(0, 12)}`.toUpperCase();
    const paidAt = new Date().toISOString();
    await db.from("mock_pix_state").update({ status: "paid", payload: { ...p, paidAmountCents: amount, endToEndId, paidAt } }).eq("id", data.id);
    return this.signEvent({ eventId: `evt_${randomUUID()}`, kind: "charge.paid", reference, amountCents: amount, endToEndId, paidAt, receiverAccount: opts.receiverAccount ?? MOCK_RECEIVER_ACCOUNT });
  }

  async simulateExpire(reference: string) {
    await adminClient().from("mock_pix_state").update({ status: "expired" }).eq("kind", "charge").eq("reference", reference);
    return this.signEvent({ eventId: `evt_${randomUUID()}`, kind: "charge.expired", reference });
  }

  async simulateRefund(endToEndId: string, amountCents: number) {
    return this.signEvent({ eventId: `evt_${randomUUID()}`, kind: "refund", refundOf: endToEndId, endToEndId: `D${randomUUID().replace(/-/g, "").slice(0, 20)}`.toUpperCase(), amountCents });
  }

  async simulatePayoutWebhook(reference: string) {
    const r = await this.getPayout(reference);
    return this.signEvent({ eventId: `evt_${randomUUID()}`, kind: r.status === "confirmed" ? "payout.confirmed" : "payout.failed", reference, providerTxId: r.providerTxId });
  }

  signEvent(body: Record<string, unknown>) {
    const raw = JSON.stringify(body);
    const signature = createHmac("sha256", env.pixWebhookSecret).update(raw).digest("hex");
    return { raw, signature, body };
  }
}

function buildFakeEmv(txid: string, amountCents: number): string {
  const amount = (amountCents / 100).toFixed(2);
  const merchant = "0014br.gov.bcb.pix2576sandbox.worldcred.local/qr/" + txid;
  const payload = `000201010212${tlv("26", merchant)}52040000530398654${String(amount.length).padStart(2, "0")}${amount}5802BR5913WORLDCRED LTD6009SAO PAULO62${tlv("05", txid).slice(2)}6304`;
  return payload + crc16(payload);
}
function tlv(id: string, value: string) { return `${id}${String(value.length).padStart(2, "0")}${value}`; }
function crc16(s: string): string {
  let crc = 0xffff;
  for (let i = 0; i < s.length; i++) {
    crc ^= s.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}
