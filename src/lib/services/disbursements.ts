import "server-only";
import { adminClient, rpc } from "@/lib/supabase/admin";
import { pixProvider, PixTimeoutError } from "@/lib/pix";
import { redact } from "@/lib/utils/mask";

/**
 * Autorização (admin com MFA) + execução do Pix de saída.
 * Exige chave Pix validada e referência única. Resposta ambígua → consulta antes de qualquer reenvio.
 */
export async function authorizeAndExecuteDisbursement(disbursementId: string, actorId: string) {
  const db = adminClient();
  const { data: d } = await db.from("disbursements").select("*, contracts(id, status, customer_id, customers(pix_key, pix_key_type, pix_key_status))").eq("id", disbursementId).single();
  if (!d) throw new Error("desembolso não encontrado");
  if (!["pending", "authorized", "timeout"].includes(d.status)) throw new Error(`desembolso em estado ${d.status}`);
  const contract = d.contracts as unknown as { id: string; status: string; customers: { pix_key: string | null; pix_key_type: string | null; pix_key_status: string } };
  const cust = contract.customers;
  if (cust.pix_key_status !== "validated" || !cust.pix_key) throw new Error("a chave Pix do cliente ainda não foi validada pelo parceiro");

  if (d.status === "pending") {
    await db.from("disbursements").update({ status: "authorized", authorized_by: actorId, authorized_at: new Date().toISOString(), pix_key: cust.pix_key, pix_key_type: cust.pix_key_type }).eq("id", d.id);
    await db.from("contracts").update({ status: "disbursing" }).eq("id", contract.id);
  }
  return executeDisbursement(d.id);
}

export async function executeDisbursement(disbursementId: string) {
  const db = adminClient();
  const provider = pixProvider();
  const { data: d } = await db.from("disbursements").select("*, contracts(number)").eq("id", disbursementId).single();
  if (!d) throw new Error("desembolso não encontrado");

  // resposta ambígua anterior: consultar antes de reenviar
  if (d.status === "timeout" || d.status === "sent") {
    return reconcileDisbursement(d.id);
  }
  if (d.status !== "authorized") throw new Error(`desembolso em estado ${d.status}`);

  await db.from("disbursements").update({ attempts: d.attempts + 1, provider: provider.name, sent_at: new Date().toISOString() }).eq("id", d.id);
  try {
    const r = await provider.createPayout({ reference: d.reference, amountCents: Number(d.amount_cents), pixKey: d.pix_key, pixKeyType: d.pix_key_type, description: `WorldCred contrato ${(d.contracts as { number: string }).number}` });
    if (r.status === "confirmed") {
      await db.from("disbursements").update({ status: "sent", provider_tx_id: r.providerTxId, raw: redact(r) }).eq("id", d.id);
      const out = await rpc<{ outcome: string }>("wc_confirm_disbursement", { p_disbursement_id: d.id, p_provider_tx_id: r.providerTxId, p_confirmed_at: r.confirmedAt ?? new Date().toISOString() });
      return { status: "confirmed" as const, detail: out };
    }
    if (r.status === "pending") {
      await db.from("disbursements").update({ status: "sent", provider_tx_id: r.providerTxId, raw: redact(r) }).eq("id", d.id);
      return { status: "sent" as const };
    }
    await db.from("disbursements").update({ status: "failed", last_error: r.error ?? "falha no provedor", raw: redact(r) }).eq("id", d.id);
    await db.from("contracts").update({ status: "pending_disbursement" }).eq("id", d.contract_id);
    await openDisbursementCase(d.contract_id, `Pix de saída falhou: ${r.error ?? "sem detalhe"}`);
    return { status: "failed" as const, error: r.error };
  } catch (e) {
    if (e instanceof PixTimeoutError) {
      await db.from("disbursements").update({ status: "timeout", last_error: e.message }).eq("id", d.id);
      await openDisbursementCase(d.contract_id, "Tempo limite no desembolso; aguardando consulta ao provedor");
      return { status: "timeout" as const };
    }
    await db.from("disbursements").update({ status: "failed", last_error: (e as Error).message }).eq("id", d.id);
    await db.from("contracts").update({ status: "pending_disbursement" }).eq("id", d.contract_id);
    await openDisbursementCase(d.contract_id, `Erro no desembolso: ${(e as Error).message}`);
    return { status: "failed" as const, error: (e as Error).message };
  }
}

/** Consulta o provedor pela referência e conclui desembolsos em estado ambíguo (timeout/sent). */
export async function reconcileDisbursement(disbursementId: string) {
  const db = adminClient();
  const { data: d } = await db.from("disbursements").select("*").eq("id", disbursementId).single();
  if (!d) throw new Error("desembolso não encontrado");
  if (d.status === "confirmed") return { status: "confirmed" as const };
  const r = await pixProvider().getPayout(d.reference);
  if (r.status === "confirmed") {
    await rpc("wc_confirm_disbursement", { p_disbursement_id: d.id, p_provider_tx_id: r.providerTxId, p_confirmed_at: r.confirmedAt ?? new Date().toISOString() });
    await db.from("collection_cases").update({ status: "resolved", resolution: "Desembolso confirmado pelo provedor", resolved_at: new Date().toISOString() }).eq("contract_id", d.contract_id).eq("reason", "disbursement_timeout").neq("status", "resolved");
    return { status: "confirmed" as const };
  }
  if (r.status === "failed") {
    await db.from("disbursements").update({ status: "failed", last_error: r.error ?? "não realizado", raw: redact(r) }).eq("id", d.id);
    await db.from("contracts").update({ status: "pending_disbursement" }).eq("id", d.contract_id);
    return { status: "failed" as const, error: r.error };
  }
  await db.from("disbursements").update({ status: "sent", provider_tx_id: r.providerTxId ?? d.provider_tx_id }).eq("id", d.id);
  return { status: "sent" as const };
}

/** Rotina: revisita desembolsos sent/timeout. */
export async function reconcilePendingDisbursements() {
  const { data } = await adminClient().from("disbursements").select("id").in("status", ["sent", "timeout"]);
  const results = [];
  for (const d of data ?? []) results.push({ id: d.id, ...(await reconcileDisbursement(d.id).catch((e) => ({ status: "error", error: (e as Error).message }))) });
  return results;
}

/** Após falha, admin pode gerar nova tentativa com NOVA referência (a antiga fica no histórico). */
export async function retryFailedDisbursement(contractId: string, actorId: string) {
  const db = adminClient();
  const { data: last } = await db.from("disbursements").select("*").eq("contract_id", contractId).order("created_at", { ascending: false }).limit(1).single();
  if (!last || last.status !== "failed") throw new Error("não há desembolso falhado para reenviar");
  // segurança: confirma no provedor que a referência antiga não foi liquidada
  const check = await pixProvider().getPayout(last.reference);
  if (check.status === "confirmed") {
    await rpc("wc_confirm_disbursement", { p_disbursement_id: last.id, p_provider_tx_id: check.providerTxId, p_confirmed_at: check.confirmedAt ?? new Date().toISOString() });
    throw new Error("a referência anterior consta como liquidada no provedor; contrato ativado sem novo envio");
  }
  const { data: cust } = await db.from("contracts").select("customers(pix_key, pix_key_type, pix_key_status)").eq("id", contractId).single();
  const c = (cust?.customers as unknown as { pix_key: string; pix_key_type: string; pix_key_status: string });
  if (c.pix_key_status !== "validated") throw new Error("chave Pix não validada");
  const { data: nd, error } = await db.from("disbursements").insert({
    contract_id: contractId, reference: `${last.reference.split("-R")[0]}-R${last.attempts + 1}${Date.now().toString(36).slice(-3).toUpperCase()}`,
    amount_cents: last.amount_cents, pix_key: c.pix_key, pix_key_type: c.pix_key_type, status: "authorized", requested_by: actorId, authorized_by: actorId, authorized_at: new Date().toISOString(),
  }).select("id").single();
  if (error) throw new Error(error.message);
  await db.from("contracts").update({ status: "disbursing" }).eq("id", contractId);
  return executeDisbursement(nd.id);
}

async function openDisbursementCase(contractId: string, detail: string) {
  const db = adminClient();
  const { data: c } = await db.from("contracts").select("customer_id").eq("id", contractId).single();
  if (!c) return;
  const { data: existing } = await db.from("collection_cases").select("id").eq("contract_id", contractId).eq("reason", "disbursement_timeout").neq("status", "resolved").limit(1);
  if (existing && existing.length) { await db.from("collection_cases").update({ detail }).eq("id", existing[0].id); return; }
  await db.from("collection_cases").insert({ contract_id: contractId, customer_id: c.customer_id, reason: "disbursement_timeout", detail });
}
