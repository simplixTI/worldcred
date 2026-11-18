/** Contrato do provedor Pix. Implementações: mock (sandbox) e API Pix padrão BACEN. */

export interface CreateChargeInput {
  reference: string;          // txid (26–35 caracteres alfanuméricos)
  amountCents: number;
  payerName: string;
  payerCpf: string;
  description: string;
  expiresInSeconds: number;
}

export interface ChargeResult {
  providerChargeId: string;
  reference: string;
  status: "active" | "paid" | "expired" | "cancelled";
  qrPayload: string;          // copia e cola (EMV)
  receiverAccount: string;    // identificador da conta recebedora
  expiresAt: string;          // ISO
  amountCents: number;
}

export interface ChargeStatus {
  reference: string;
  status: "active" | "paid" | "expired" | "cancelled";
  paidAmountCents?: number;
  endToEndId?: string;
  paidAt?: string;
  receiverAccount?: string;
}

export interface PayoutInput {
  reference: string;          // referência única (idempotência)
  amountCents: number;
  pixKey: string;
  pixKeyType: string | null;
  description: string;
}

export interface PayoutResult {
  reference: string;
  providerTxId: string | null;
  status: "confirmed" | "pending" | "failed";
  error?: string;
  confirmedAt?: string;
}

export interface KeyValidationResult {
  valid: boolean;
  keyType: string | null;
  ownerNameMasked?: string;
  ownerDocumentMasked?: string;
  ownerDocumentMatches?: boolean;
  reason?: string;
}

export interface WebhookEvent {
  externalId: string;         // id único do evento no provedor
  kind: "charge.paid" | "charge.expired" | "payout.confirmed" | "payout.failed" | "refund" | "unknown";
  reference: string | null;
  amountCents: number | null;
  endToEndId: string | null;
  paidAt: string | null;
  receiverAccount: string | null;
  refundOf?: string | null;
  providerTxId?: string | null;
  raw: unknown;
}

export class PixTimeoutError extends Error {
  constructor(message = "tempo limite ao falar com o provedor Pix") { super(message); this.name = "PixTimeoutError"; }
}

export interface PixProvider {
  readonly name: string;
  createCharge(input: CreateChargeInput): Promise<ChargeResult>;
  getCharge(reference: string): Promise<ChargeStatus>;
  cancelCharge(reference: string): Promise<void>;
  createPayout(input: PayoutInput): Promise<PayoutResult>;
  getPayout(reference: string): Promise<PayoutResult>;
  validateKey(pixKey: string, expectedCpf: string): Promise<KeyValidationResult>;
  /** Valida autenticidade e normaliza o evento. Retorna null se a assinatura for inválida. */
  verifyWebhook(rawBody: string, headers: Record<string, string | null>): Promise<WebhookEvent | null>;
}
