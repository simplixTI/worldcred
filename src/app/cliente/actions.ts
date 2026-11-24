"use server";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { setPixKey } from "@/lib/services/customers";
import { getOrCreateCharge } from "@/lib/services/charges";

export type ActionState = { error?: string; ok?: string } | undefined;

export async function acceptProposalAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await assertRole(["client"], { mfa: false });
  const proposalId = String(formData.get("proposal_id"));
  const text = String(formData.get("terms_text") || "");
  if (formData.get("agree") !== "on") return { error: "Marque a declaração de leitura e concordância." };
  const h = await headers();
  const evidence = {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null,
    user_agent: h.get("user-agent"),
    text_hash: createHash("sha256").update(text).digest("hex"),
    method: "portal_checkbox",
  };
  const supabase = await createClient();
  const { error } = await supabase.rpc("wc_accept_proposal", { p_proposal_id: proposalId, p_evidence: evidence });
  if (error) return { error: error.message };
  redirect(`/cliente/propostas/${proposalId}?aceita=1`);
}

export async function claimPaidAction(installmentId: string, note: string): Promise<ActionState> {
  await assertRole(["client"], { mfa: false });
  const supabase = await createClient();
  const { error } = await supabase.rpc("wc_claim_payment", { p_installment_id: installmentId, p_note: note || null });
  if (error) return { error: error.message };
  revalidatePath(`/cliente/parcelas/${installmentId}`);
  return { ok: "Solicitação registrada. A cobrança fica pausada enquanto conferimos." };
}

export async function setPixKeyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const s = await assertRole(["client"], { mfa: false });
  try {
    const r = await setPixKey(s.userId, String(formData.get("pix_key") || ""));
    revalidatePath("/cliente/pix");
    return r.valid ? { ok: "Chave validada pelo parceiro Pix. Titularidade confirmada." } : { error: `Chave não validada: ${r.reason ?? "titularidade não confirmada"}` };
  } catch (e) { return { error: (e as Error).message }; }
}

export async function regenerateChargeAction(installmentId: string): Promise<ActionState> {
  const s = await assertRole(["client"], { mfa: false });
  const supabase = await createClient();
  const { data } = await supabase.from("installments").select("id").eq("id", installmentId).maybeSingle();
  if (!data) return { error: "parcela não encontrada" };
  try { await getOrCreateCharge(installmentId, s.userId); } catch (e) { return { error: (e as Error).message }; }
  revalidatePath(`/cliente/parcelas/${installmentId}`);
  return { ok: "Novo QR Code gerado." };
}

export async function startCardAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const s = await assertRole(["client"], { mfa: false });
  let url: string;
  try {
    const { startCardOperation } = await import("@/lib/services/card");
    const r = await startCardOperation(s.userId, Number(formData.get("net_cents")), Number(formData.get("installments")));
    url = r.checkoutUrl;
  } catch (e) { return { error: (e as Error).message }; }
  redirect(url);
}

export async function createCardOperationAction(netCents: number, installments: number): Promise<{ error?: string; operationId?: string; grossCents?: number; email?: string; cpf?: string }> {
  const s = await assertRole(["client"], { mfa: false });
  try {
    const { createCardOperation } = await import("@/lib/services/card");
    const r = await createCardOperation(s.userId, netCents, installments);
    return { operationId: r.operationId, grossCents: r.grossCents, email: r.customer.email, cpf: r.customer.cpf };
  } catch (e) { return { error: (e as Error).message }; }
}

export async function payCardAction(operationId: string, form: { token: string; installments: number; payment_method_id: string; issuer_id?: string | null; payer?: { email?: string; identification?: { type?: string; number?: string } } }): Promise<{ error?: string; status?: string; detail?: string }> {
  const s = await assertRole(["client"], { mfa: false });
  try {
    const { payCardWithToken } = await import("@/lib/services/card");
    const r = await payCardWithToken(s.userId, operationId, form);
    revalidatePath("/cliente/cartao");
    return { status: r.status, detail: r.status_detail };
  } catch (e) { return { error: (e as Error).message }; }
}

/** Cliente escolhe "prestações": gera a proposta de valor livre, vinculada ao agente indicador. */
export async function chooseInstallmentsAction(principalCents: number, term: number): Promise<ActionState> {
  await assertRole(["client"], { mfa: false });
  const supabase = await createClient();
  const { data: me } = await supabase.from("customers").select("id").maybeSingle();
  if (!me) return { error: "cadastro não encontrado" };
  const { data: open } = await supabase.from("proposals").select("id").in("status", ["sent", "accepted", "approved"]).limit(1);
  if (open && open.length) return { error: "Você já tem uma proposta em andamento." };
  let id: string;
  try {
    const { adminClient } = await import("@/lib/supabase/admin");
    const { createFlexibleProposal } = await import("@/lib/services/loan");
    const { data: link } = await adminClient().from("agent_customers").select("agent_id").eq("customer_id", me.id).order("created_at").limit(1).maybeSingle();
    const r = await createFlexibleProposal(link?.agent_id ?? null, me.id, principalCents, term);
    id = r.proposalId;
  } catch (e) { return { error: (e as Error).message }; }
  redirect(`/cliente/propostas/${id}?nova=1`);
}
