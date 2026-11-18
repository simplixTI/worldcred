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
