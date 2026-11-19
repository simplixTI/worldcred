import "server-only";
import { adminClient, rpc } from "@/lib/supabase/admin";
import { buildSchedule } from "@/lib/finance/price";
import { env } from "@/lib/env";
import { getSetting } from "./settings";
import { createPreference, getPayment, createTokenPayment, type MpPayment } from "@/lib/card/mercadopago";
import { pixProvider, PixTimeoutError } from "@/lib/pix";
import { redact } from "@/lib/utils/mask";

export interface CardSettings { enabled: boolean; provider: string | null; integration_approved: boolean; monthly_rate: string; max_installments: number; min_cents: number; max_cents: number; allow_disburse_before_release: boolean; }
export const DEFAULT_CARD: CardSettings = { enabled: false, provider: "mercadopago", integration_approved: false, monthly_rate: "0.15", max_installments: 12, min_cents: 100000, max_cents: 1000000, allow_disburse_before_release: true };

export async function getCardSettings(): Promise<CardSettings & { live: boolean }> {
  const s = { ...DEFAULT_CARD, ...(await getSetting<Partial<CardSettings>>("card", {})) };
  return { ...s, live: s.enabled && !!process.env.MP_ACCESS_TOKEN };
}

/** Cotação: cliente recebe `netCents` via Pix e paga o total (Price à taxa configurada) em N parcelas no cartão. */
export function quoteCard(netCents: number, installments: number, monthlyRate: string) {
  const s = buildSchedule({ principalCents: netCents, monthlyRate, termMonths: installments });
  // o total é parcelado no cartão em N vezes iguais (arredondado a centavos; a diferença fica na última)
  const per = Math.round(s.total_cents / installments);
  return { net_cents: netCents, gross_cents: s.total_cents, installments, installment_cents: per, last_installment_cents: s.total_cents - per * (installments - 1), monthly_rate: monthlyRate, annual_rate: s.annual_rate, cet_monthly: s.cet_monthly, cet_annual: s.cet_annual, fees_cents: s.total_cents - netCents, schedule: s };
}

/** Cria a operação (rascunho) a partir da cotação. */
export async function createCardOperation(userId: string, netCents: number, installments: number) {
  const cfg = await getCardSettings();
  if (!cfg.live) throw new Error("Crédito com cartão não está disponível no momento");
  if (netCents < cfg.min_cents || netCents > cfg.max_cents) throw new Error("Valor fora dos limites da modalidade");
  if (installments < 1 || installments > cfg.max_installments) throw new Error("Quantidade de parcelas inválida");
  const db = adminClient();
  const { data: c } = await db.from("customers").select("id, full_name, email, cpf, pix_key, pix_key_status").eq("user_id", userId).single();
  if (!c) throw new Error("cadastro não encontrado");
  if (c.pix_key_status !== "validated" || !c.pix_key) throw new Error("Cadastre e valide sua chave Pix antes de contratar");
  const q = quoteCard(netCents, installments, cfg.monthly_rate);
  const { data: op, error } = await db.from("card_operations").insert({
    customer_id: c.id, provider: "mercadopago", gross_cents: q.gross_cents, installments, installment_cents: q.installment_cents, fees_cents: q.fees_cents, net_pix_cents: netCents,
    monthly_rate: cfg.monthly_rate, schedule: { ...q.schedule, installment_cents: q.installment_cents, last_installment_cents: q.last_installment_cents }, status: "draft", authorization_status: "pending", pix_key: c.pix_key,
    checkout_reference: `WCC-${Date.now().toString(36).toUpperCase()}`,
  }).select("id, checkout_reference").single();
  if (error) throw new Error(error.message);
  await rpc("wc_audit", { p_action: "card.operation_created", p_entity: "card_operations", p_entity_id: op.id, p_meta: { net_cents: netCents, installments } }).catch(() => {});
  return { operationId: op.id as string, grossCents: q.gross_cents, installments, customer: { email: c.email ?? `${c.id}@worldcred.digital`, cpf: c.cpf, name: c.full_name } };
}

/** Fluxo de reserva: checkout hospedado (redireciona para o Mercado Pago). */
export async function startCardOperation(userId: string, netCents: number, installments: number) {
  const op = await createCardOperation(userId, netCents, installments);
  const pref = await createPreference({
    externalReference: op.operationId, title: `WorldCred · crédito com cartão em ${installments}x`, amountCents: op.grossCents, installments,
    payerEmail: op.customer.email, payerName: op.customer.name,
    backUrl: `${env.appUrl}/cliente/cartao/retorno`, notificationUrl: `${env.appUrl}/api/webhooks/mercadopago`,
  });
  const url = process.env.MP_ACCESS_TOKEN?.startsWith("TEST-") && pref.sandboxInitPoint ? pref.sandboxInitPoint : pref.initPoint;
  await adminClient().from("card_operations").update({ provider_preference_id: pref.id, checkout_url: url }).eq("id", op.operationId);
  return { operationId: op.operationId, checkoutUrl: url as string };
}

/** Checkout Transparente: recebe o token do Brick, cria o pagamento e registra o resultado. */
export async function payCardWithToken(userId: string, operationId: string, form: { token: string; installments: number; payment_method_id: string; issuer_id?: string | null; payer?: { email?: string; identification?: { type?: string; number?: string } } }) {
  const db = adminClient();
  const { data: c } = await db.from("customers").select("id, email, cpf").eq("user_id", userId).single();
  const { data: op } = await db.from("card_operations").select("*").eq("id", operationId).single();
  if (!c || !op || op.customer_id !== c.id) throw new Error("operação não encontrada");
  if (op.status !== "draft") throw new Error("esta operação já foi processada");
  if (form.installments !== op.installments) throw new Error("quantidade de parcelas diferente da cotação");
  let p: MpPayment;
  try {
    p = await createTokenPayment({
      externalReference: op.id, amountCents: Number(op.gross_cents), token: form.token, installments: form.installments, paymentMethodId: form.payment_method_id, issuerId: form.issuer_id,
      payerEmail: form.payer?.email || c.email || `${c.id}@worldcred.digital`, payerIdType: "CPF", payerIdNumber: form.payer?.identification?.number || c.cpf,
      description: `WorldCred crédito com cartão ${op.checkout_reference}`, notificationUrl: `${env.appUrl}/api/webhooks/mercadopago`,
    });
  } catch (e) {
    await db.from("card_operations").update({ authorization_status: `error: ${(e as Error).message.slice(0, 120)}` }).eq("id", op.id);
    throw e;
  }
  const r = await rpc<Record<string, unknown>>("wc_card_payment_result", {
    p_operation: op.id, p_payment_id: p.id, p_status: p.status, p_amount_cents: Math.round(p.transaction_amount * 100), p_installments: p.installments,
    p_paid_at: p.date_approved, p_release_at: p.money_release_date, p_raw: redact({ status: p.status, status_detail: p.status_detail, payment_type: p.payment_type_id, card_last4: p.card?.last_four_digits ?? null }),
  });
  return { status: p.status, status_detail: p.status_detail, outcome: r.outcome as string };
}

/** Consulta o pagamento no Mercado Pago e registra o resultado (idempotente). Usado pelo webhook e pela página de retorno. */
export async function syncCardPayment(paymentId: string) {
  const p = await getPayment(paymentId);
  if (!p) return { outcome: "payment_not_found", payment_id: paymentId };
  if (!p.external_reference) return { outcome: "ignored", reason: "sem external_reference" };
  const r = await rpc<Record<string, unknown>>("wc_card_payment_result", {
    p_operation: p.external_reference, p_payment_id: p.id, p_status: p.status, p_amount_cents: Math.round(p.transaction_amount * 100), p_installments: p.installments,
    p_paid_at: p.date_approved, p_release_at: p.money_release_date, p_raw: redact({ status: p.status, status_detail: p.status_detail, payment_type: p.payment_type_id, card_last4: p.card?.last_four_digits ?? null }),
  });
  return r;
}

/** Admin libera o Pix líquido ao cliente (após aprovação/liberação do cartão). Referência única; sem reenvio sem consulta. */
export async function disburseCardOperation(operationId: string, actorId: string) {
  const cfg = await getCardSettings();
  const db = adminClient();
  const { data: op } = await db.from("card_operations").select("*").eq("id", operationId).single();
  if (!op) throw new Error("operação não encontrada");
  if (op.status === "disbursed") return { status: "already" as const };
  if (op.status === "disputed") throw new Error("operação em contestação");
  if (!(op.status === "settled" || (op.status === "authorized" && cfg.allow_disburse_before_release))) throw new Error(`operação ainda não liberada (status ${op.status})`);
  const reference = op.disbursement_reference ?? `WCC${op.id.replace(/-/g, "").slice(0, 12).toUpperCase()}-${Date.now().toString(36).slice(-3).toUpperCase()}`;
  if (op.disbursement_reference) {
    const st = await pixProvider().getPayout(op.disbursement_reference);
    if (st.status === "confirmed") return rpc("wc_card_mark_disbursed", { p_operation: op.id, p_reference: op.disbursement_reference, p_tx_id: st.providerTxId, p_actor: actorId }).then(() => ({ status: "confirmed" as const }));
    if (st.status === "pending") return { status: "sent" as const };
  }
  await db.from("card_operations").update({ disbursement_reference: reference, disbursement_status: "sent" }).eq("id", op.id);
  try {
    const r = await pixProvider().createPayout({ reference, amountCents: Number(op.net_pix_cents), pixKey: op.pix_key, pixKeyType: null, description: `WorldCred crédito cartão ${op.checkout_reference}` });
    if (r.status === "confirmed") { await rpc("wc_card_mark_disbursed", { p_operation: op.id, p_reference: reference, p_tx_id: r.providerTxId, p_actor: actorId }); return { status: "confirmed" as const }; }
    if (r.status === "pending") return { status: "sent" as const };
    await db.from("card_operations").update({ disbursement_status: `failed: ${r.error ?? ""}` }).eq("id", op.id);
    return { status: "failed" as const, error: r.error };
  } catch (e) {
    if (e instanceof PixTimeoutError) { await db.from("card_operations").update({ disbursement_status: "timeout" }).eq("id", op.id); return { status: "timeout" as const }; }
    throw e;
  }
}
