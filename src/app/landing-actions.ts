"use server";
import { createClient } from "@/lib/supabase/server";
import { isValidCPF, normalizePhoneBR, onlyDigits } from "@/lib/utils/mask";
import { cpfHash } from "@/lib/services/customers";

export type LeadState = { error?: string; ok?: string } | undefined;

export async function createLeadAction(_prev: LeadState, formData: FormData): Promise<LeadState> {
  const name = String(formData.get("full_name") || "").trim();
  const cpf = onlyDigits(String(formData.get("cpf") || ""));
  const phone = normalizePhoneBR(String(formData.get("phone") || ""));
  const email = String(formData.get("email") || "").trim();
  const amount = Number(formData.get("amount_cents") || 0) || null;
  const term = Number(formData.get("term_months") || 0) || null;
  const ref = String(formData.get("ref") || "").trim() || null;
  if (name.length < 5) return { error: "Informe seu nome completo." };
  if (!isValidCPF(cpf)) return { error: "CPF inválido." };
  if (!phone) return { error: "Informe um celular válido com DDD." };
  if (formData.get("consent") !== "on") return { error: "Precisamos do seu consentimento para entrar em contato." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("wc_create_lead", { p_full_name: name, p_cpf: cpf, p_cpf_hash: cpfHash(cpf), p_phone: phone, p_email: email || null, p_amount_cents: amount, p_term_months: term, p_ref: ref });
  if (error) return { error: error.message.includes("já recebemos") ? "Já recebemos sua solicitação. Em breve um agente entra em contato." : "Não foi possível enviar agora. Tente novamente em instantes." };
  const customerId = (data as { customer_id?: string | null })?.customer_id;
  if (customerId) {
    try {
      const { inviteCustomer } = await import("@/lib/services/customers");
      await inviteCustomer(customerId);
      return { ok: "Recebido! Enviamos um SMS com o link para você criar seu acesso ao portal." };
    } catch { /* sem chave de serviço ou cliente já com acesso: segue com contato humano */ }
  }
  return { ok: "Recebido! Um agente WorldCred vai falar com você pelo celular informado." };
}
