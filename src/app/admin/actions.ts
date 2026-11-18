"use server";
import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/auth";
import { adminClient, rpc } from "@/lib/supabase/admin";
import { authorizeAndExecuteDisbursement, reconcileDisbursement, retryFailedDisbursement } from "@/lib/services/disbursements";
import { runCollectionCycle } from "@/lib/services/collections";
import { expireCharges } from "@/lib/services/charges";
import { reconcilePendingDisbursements } from "@/lib/services/disbursements";
import { mockPix } from "@/lib/pix";
import { processPixWebhook } from "@/lib/services/webhook";
import { env } from "@/lib/env";

export type ActionState = { error?: string; ok?: string } | undefined;

async function admin() { return assertRole(["admin"], { mfa: true }); }
function wrap<T extends unknown[]>(fn: (...a: T) => Promise<string>, paths: string[] = []) {
  return async (...a: T): Promise<ActionState> => {
    try { const ok = await fn(...a); paths.forEach((p) => revalidatePath(p)); return { ok }; } catch (e) { return { error: (e as Error).message }; }
  };
}

export const approveProposal = wrap(async (id: string, note: string) => { const s = await admin(); await rpc("wc_approve_proposal", { p_proposal_id: id, p_actor: s.userId, p_note: note || null }); return "Proposta aprovada; contrato criado aguardando desembolso."; }, ["/admin/propostas", "/admin/desembolsos"]);
export const declineProposal = wrap(async (id: string, note: string) => { const s = await admin(); await rpc("wc_decline_proposal", { p_proposal_id: id, p_actor: s.userId, p_note: note }); return "Proposta recusada."; }, ["/admin/propostas"]);

export const authorizeDisbursement = wrap(async (id: string) => {
  const s = await admin();
  const r = await authorizeAndExecuteDisbursement(id, s.userId);
  return r.status === "confirmed" ? "Pix enviado e confirmado. Contrato ativo e parcelas geradas." : r.status === "sent" ? "Pix enviado; aguardando confirmação do provedor." : r.status === "timeout" ? "Tempo limite no provedor. Nenhum reenvio será feito até a consulta de status." : `Falha: ${r.error}`;
}, ["/admin/desembolsos", "/admin"]);
export const consultDisbursement = wrap(async (id: string) => { await admin(); const r = await reconcileDisbursement(id); return `Status no provedor: ${r.status}`; }, ["/admin/desembolsos"]);
export const retryDisbursement = wrap(async (contractId: string) => { const s = await admin(); const r = await retryFailedDisbursement(contractId, s.userId); return `Nova tentativa: ${r.status}`; }, ["/admin/desembolsos"]);

export const caseAction = wrap(async (id: string, action: string, note?: string, target?: string) => {
  const s = await admin();
  await rpc("wc_case_action", { p_case_id: id, p_action: action, p_actor: s.userId, p_note: note ?? null, p_target: target ?? null });
  return "Caso atualizado.";
}, ["/admin/cobranca"]);
export const reviewClaim = wrap(async (id: string, confirmed: boolean, note?: string) => { const s = await admin(); await rpc("wc_review_claim", { p_claim_id: id, p_actor: s.userId, p_confirmed: confirmed, p_note: note ?? null }); return "Conferência registrada."; }, ["/admin/cobranca"]);
export const resolveReconciliation = wrap(async (id: string, action: string, note?: string) => { const s = await admin(); await rpc("wc_resolve_reconciliation", { p_item_id: id, p_action: action, p_actor: s.userId, p_note: note ?? null }); return "Item conciliado (auditado)."; }, ["/admin/conciliacao", "/admin"]);
export const linkPayment = wrap(async (id: string, installmentId: string, note?: string) => { const s = await admin(); await rpc("wc_link_payment", { p_item_id: id, p_installment_id: installmentId, p_actor: s.userId, p_note: note ?? null }); return "Pagamento vinculado e aplicado."; }, ["/admin/conciliacao"]);

export const runCollections = wrap(async () => { await admin(); const r = await runCollectionCycle(); return `Régua executada: ${JSON.stringify(r)}`; }, ["/admin/cobranca", "/admin/sandbox"]);
export const runReconcile = wrap(async () => { await admin(); const d = await reconcilePendingDisbursements(); const c = await expireCharges(); return `Conciliação: ${JSON.stringify({ d, c })}`; }, ["/admin/desembolsos", "/admin/sandbox"]);

export const saveSettings = wrap(async (key: string, value: Record<string, unknown>) => {
  const s = await admin();
  const db = adminClient();
  await db.rpc("wc_audit", { p_action: "settings.update", p_entity: "settings", p_entity_id: key, p_after: value }).then(() => {});
  const { error } = await db.from("settings").upsert({ key, value, updated_by: s.userId, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  return "Configuração salva.";
}, ["/admin/configuracoes", "/admin/cartao"]);

export const setAgentActive = wrap(async (agentId: string, active: boolean) => { const s = await admin(); await rpc("wc_set_agent_active", { p_agent: agentId, p_active: active, p_actor: s.userId }); return active ? "Agente reativado." : "Agente desativado; acesso revogado e autoria preservada."; }, ["/admin/agentes"]);

export const createAgent = wrap(async (fullName: string, email: string, password: string, role: "agent" | "admin") => {
  const s = await admin();
  const db = adminClient();
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } });
  if (error || !data.user) throw new Error(error?.message ?? "erro ao criar usuário");
  const { error: pe } = await db.from("profiles").insert({ id: data.user.id, role, full_name: fullName, email, created_by: s.userId });
  if (pe) throw new Error(pe.message);
  return "Usuário criado.";
}, ["/admin/agentes"]);

export const saveProductVersion = wrap(async (input: { productId?: string; name: string; principalCents: number; monthlyRate: string; allowedTerms: number[]; feeCents: number; validFrom: string; active: boolean }) => {
  const s = await admin();
  const db = adminClient();
  let productId = input.productId;
  if (!productId) {
    const { data, error } = await db.from("products").insert({ name: input.name, principal_cents: input.principalCents, active: input.active }).select("id").single();
    if (error) throw new Error(error.message); productId = data.id;
  } else {
    const { error } = await db.from("products").update({ name: input.name, active: input.active }).eq("id", productId);
    if (error) throw new Error(error.message);
  }
  const { data: last } = await db.from("product_versions").select("version").eq("product_id", productId).order("version", { ascending: false }).limit(1).maybeSingle();
  const { error } = await db.from("product_versions").insert({ product_id: productId, version: (last?.version ?? 0) + 1, monthly_rate: input.monthlyRate, allowed_terms: input.allowedTerms, fee_cents: input.feeCents, valid_from: input.validFrom, created_by: s.userId });
  if (error) throw new Error(error.message);
  await db.rpc("wc_audit", { p_action: "product.version", p_entity: "products", p_entity_id: productId, p_after: input as unknown as Record<string, unknown> }).then(() => {});
  return "Nova versão publicada. Propostas já enviadas e contratos mantêm as condições anteriores.";
}, ["/admin/produtos"]);

// ---------- Simulador sandbox ----------
async function postWebhook(raw: string, signature: string) {
  const out = await processPixWebhook(raw, { "x-wc-signature": signature });
  return `HTTP ${out.status} · ${JSON.stringify(out.body)}`;
}
export const simPay = wrap(async (reference: string, amountCents?: number, receiver?: string) => { await admin(); if (!env.isSandbox) throw new Error("apenas sandbox"); const e = await mockPix().simulatePayment(reference, amountCents, { receiverAccount: receiver }); return postWebhook(e.raw, e.signature); }, ["/admin/sandbox", "/admin", "/admin/conciliacao"]);
export const simResend = wrap(async (eventRaw: string) => { await admin(); const e = mockPix().signEvent(JSON.parse(eventRaw)); return postWebhook(e.raw, e.signature); }, ["/admin/sandbox"]);
export const simExpire = wrap(async (reference: string) => { await admin(); const e = await mockPix().simulateExpire(reference); return postWebhook(e.raw, e.signature); }, ["/admin/sandbox"]);
export const simRefund = wrap(async (e2e: string, amountCents: number) => { await admin(); const e = await mockPix().simulateRefund(e2e, amountCents); return postWebhook(e.raw, e.signature); }, ["/admin/sandbox", "/admin/conciliacao"]);
export const simBadSignature = wrap(async (reference: string) => { await admin(); const e = mockPix().signEvent({ eventId: `evt_bad_${Date.now()}`, kind: "charge.paid", reference, amountCents: 1 }); return postWebhook(e.raw, "assinatura-invalida"); }, ["/admin/sandbox"]);
export const simPayoutWebhook = wrap(async (reference: string) => { await admin(); const e = await mockPix().simulatePayoutWebhook(reference); return postWebhook(e.raw, e.signature); }, ["/admin/sandbox", "/admin/desembolsos"]);
