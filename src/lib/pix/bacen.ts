import "server-only";
import type {
  ChargeResult, ChargeStatus, CreateChargeInput, KeyValidationResult, PayoutInput, PayoutResult, PixProvider, WebhookEvent,
} from "./types";
import { PixTimeoutError } from "./types";

/**
 * Esqueleto de integração com a API Pix padrão BACEN (cob, pix, webhook), usada por PSPs
 * como Efí, Sicoob, Itaú etc. Requer certificado mTLS e credenciais OAuth2.
 * NÃO VALIDADO EM PRODUÇÃO: antes de habilitar dinheiro real, confirme com o PSP os
 * endpoints de pagamento de saída (não padronizados) e a verificação de webhook (mTLS/IP).
 */
export class BacenApiPixProvider implements PixProvider {
  readonly name = "bacen";
  private base = process.env.PIX_API_BASE_URL || "";
  private clientId = process.env.PIX_CLIENT_ID || "";
  private clientSecret = process.env.PIX_CLIENT_SECRET || "";
  private pixKey = process.env.PIX_RECEIVER_KEY || "";
  private token: { value: string; exp: number } | null = null;

  private async auth(): Promise<string> {
    if (this.token && this.token.exp > Date.now() + 30_000) return this.token.value;
    const res = await this.fetch("/oauth/token", { method: "POST", headers: { Authorization: "Basic " + Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64"), "Content-Type": "application/json" }, body: JSON.stringify({ grant_type: "client_credentials" }) }, false);
    const j = await res.json();
    this.token = { value: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 };
    return this.token.value;
  }

  private async fetch(path: string, init: RequestInit, withAuth = true): Promise<Response> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15_000);
    try {
      const headers = new Headers(init.headers);
      if (withAuth) headers.set("Authorization", `Bearer ${await this.auth()}`);
      // mTLS: configure via agente HTTPS (undici Agent com cert/key) no ambiente de execução
      const res = await fetch(this.base + path, { ...init, headers, signal: ctrl.signal });
      if (!res.ok) throw new Error(`PSP ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return res;
    } catch (e) {
      if ((e as Error).name === "AbortError") throw new PixTimeoutError();
      throw e;
    } finally { clearTimeout(t); }
  }

  async createCharge(input: CreateChargeInput): Promise<ChargeResult> {
    const res = await this.fetch(`/v2/cob/${input.reference}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ calendario: { expiracao: input.expiresInSeconds }, devedor: { cpf: input.payerCpf, nome: input.payerName }, valor: { original: (input.amountCents / 100).toFixed(2) }, chave: this.pixKey, solicitacaoPagador: input.description }),
    });
    const j = await res.json();
    return { providerChargeId: String(j.loc?.id ?? j.txid), reference: j.txid, status: "active", qrPayload: j.pixCopiaECola ?? "", receiverAccount: this.pixKey, expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000).toISOString(), amountCents: input.amountCents };
  }

  async getCharge(reference: string): Promise<ChargeStatus> {
    const res = await this.fetch(`/v2/cob/${reference}`, { method: "GET" });
    const j = await res.json();
    const map: Record<string, ChargeStatus["status"]> = { ATIVA: "active", CONCLUIDA: "paid", REMOVIDA_PELO_USUARIO_RECEBEDOR: "cancelled", REMOVIDA_PELO_PSP: "expired" };
    const pix = j.pix?.[0];
    return { reference, status: map[j.status] ?? "active", paidAmountCents: pix ? Math.round(Number(pix.valor) * 100) : undefined, endToEndId: pix?.endToEndId, paidAt: pix?.horario, receiverAccount: this.pixKey };
  }

  async cancelCharge(reference: string): Promise<void> {
    await this.fetch(`/v2/cob/${reference}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "REMOVIDA_PELO_USUARIO_RECEBEDOR" }) });
  }

  async createPayout(input: PayoutInput): Promise<PayoutResult> {
    // Endpoint de envio de Pix varia por PSP (ex.: Efí: PUT /v3/gn/pix/:idEnvio). Ajustar conforme o parceiro.
    const res = await this.fetch(`/v3/pix/send/${input.reference}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ valor: (input.amountCents / 100).toFixed(2), favorecido: { chave: input.pixKey }, infoPagador: input.description }) });
    const j = await res.json();
    return { reference: input.reference, providerTxId: j.e2eId ?? null, status: j.status === "REALIZADO" ? "confirmed" : j.status === "NAO_REALIZADO" ? "failed" : "pending" };
  }

  async getPayout(reference: string): Promise<PayoutResult> {
    const res = await this.fetch(`/v3/pix/send/id/${reference}`, { method: "GET" });
    const j = await res.json();
    return { reference, providerTxId: j.e2eId ?? null, status: j.status === "REALIZADO" ? "confirmed" : j.status === "NAO_REALIZADO" ? "failed" : "pending", confirmedAt: j.horario?.liquidacao };
  }

  async validateKey(pixKey: string, expectedCpf: string): Promise<KeyValidationResult> {
    // Consulta DICT depende de autorização específica do PSP; alternativa: micro-Pix de validação.
    void pixKey; void expectedCpf;
    return { valid: false, keyType: null, reason: "validação de chave não configurada para este PSP" };
  }

  async verifyWebhook(rawBody: string, headers: Record<string, string | null>): Promise<WebhookEvent | null> {
    // Padrão BACEN: autenticidade por mTLS do PSP; muitos PSPs aceitam também um segredo na URL/header.
    if (headers["x-webhook-secret"] !== process.env.PIX_WEBHOOK_SECRET) return null;
    const body = JSON.parse(rawBody);
    const pix = body.pix?.[0];
    if (!pix) return null;
    return { externalId: pix.endToEndId, kind: pix.devolucoes?.length ? "refund" : "charge.paid", reference: pix.txid, amountCents: Math.round(Number(pix.valor) * 100), endToEndId: pix.endToEndId, paidAt: pix.horario, receiverAccount: this.pixKey, raw: body };
  }
}
