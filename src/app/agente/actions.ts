"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/auth";
import { registerCustomer, inviteCustomer } from "@/lib/services/customers";
import { createAndSendProposal } from "@/lib/services/proposals";
import { rpc } from "@/lib/supabase/admin";

export type ActionState = { error?: string; ok?: string } | undefined;

export async function newCustomerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const s = await assertRole(["agent"], { mfa: false });
  let id: string;
  try {
    const r = await registerCustomer(s.userId, {
      fullName: String(formData.get("full_name") || ""), cpf: String(formData.get("cpf") || ""),
      phone: String(formData.get("phone") || ""), email: String(formData.get("email") || "") || null,
    });
    id = r.customerId;
    if (formData.get("invite") === "on") await inviteCustomer(id).catch(() => {});
  } catch (e) { return { error: (e as Error).message }; }
  redirect(`/agente/clientes/${id}`);
}

export async function inviteAction(customerId: string): Promise<ActionState> {
  const s = await assertRole(["agent", "admin"], { mfa: false });
  const { rpc: _r } = await import("@/lib/supabase/admin"); void _r;
  const { adminClient } = await import("@/lib/supabase/admin");
  const { data } = await adminClient().from("agent_customers").select("customer_id").eq("agent_id", s.userId).eq("customer_id", customerId).maybeSingle();
  if (!data && s.role !== "admin") return { error: "cliente fora da sua carteira" };
  try {
    const r = await inviteCustomer(customerId);
    revalidatePath(`/agente/clientes/${customerId}`);
    return { ok: r.sms.ok ? "Convite enviado por SMS." : `Convite gerado, mas o SMS falhou (${r.sms.error}). Link: ${r.inviteUrl}` };
  } catch (e) { return { error: (e as Error).message }; }
}

export async function sendProposalAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const s = await assertRole(["agent"], { mfa: false });
  let id: string;
  try {
    const r = await createAndSendProposal(s.userId, String(formData.get("customer_id")), String(formData.get("product_version_id")), Number(formData.get("term_months")));
    id = r.proposalId;
  } catch (e) { return { error: (e as Error).message }; }
  redirect(`/agente/propostas/${id}`);
}

export async function agentCaseAction(caseId: string, action: "take" | "resolve" | "pause" | "resume", note?: string): Promise<ActionState> {
  const s = await assertRole(["agent"], { mfa: false });
  try {
    await rpc("wc_case_action", { p_case_id: caseId, p_action: action, p_actor: s.userId, p_note: note ?? null });
    revalidatePath("/agente/casos");
    return { ok: "Atualizado." };
  } catch (e) { return { error: (e as Error).message }; }
}
