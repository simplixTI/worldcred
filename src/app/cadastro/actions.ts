"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { adminClient, rpc } from "@/lib/supabase/admin";
import { isValidCPF, normalizePhoneBR, onlyDigits } from "@/lib/utils/mask";
import { cpfHash } from "@/lib/services/customers";
import { createAndSendProposal, activeProductVersions } from "@/lib/services/proposals";
import { lookupCpf, type CpfLookupResult } from "@/lib/services/cpf-lookup";

export type SignupState = { error?: string } | undefined;

// limite simples por IP para a consulta pública de CPF (reinicia a cada instância; suficiente contra abuso casual)
const hits = new Map<string, { n: number; t: number }>();
function limited(ip: string, max = 8, windowMs = 10 * 60_000) {
  const now = Date.now(); const h = hits.get(ip);
  if (!h || now - h.t > windowMs) { hits.set(ip, { n: 1, t: now }); return false; }
  h.n++; return h.n > max;
}

export async function publicLookupCpfAction(cpf: string): Promise<CpfLookupResult | { error: string }> {
  if (!isValidCPF(cpf)) return { error: "CPF inválido" };
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (limited(ip)) return { available: false, found: false, reason: "muitas consultas; preencha manualmente" };
  return lookupCpf(cpf);
}

export async function checkAgentCodeAction(code: string): Promise<{ ok: boolean; firstName?: string }> {
  const c = code.trim();
  if (!c) return { ok: false };
  const { data } = await adminClient().rpc("wc_public_agent", { p_code: c });
  const a = data as { first_name?: string } | null;
  return a?.first_name ? { ok: true, firstName: a.first_name } : { ok: false };
}

export async function selfSignupAction(_prev: SignupState, formData: FormData): Promise<SignupState> {
  const f = (k: string) => String(formData.get(k) || "").trim();
  const name = f("full_name"), cpf = onlyDigits(f("cpf")), email = f("email").toLowerCase(), password = f("password");
  const phone = normalizePhoneBR(f("phone")); const code = f("agent_code"); const pvId = f("product_version_id"); const term = Number(f("term_months"));
  if (name.length < 5) return { error: "Informe seu nome completo." };
  if (!isValidCPF(cpf)) return { error: "CPF inválido." };
  if (!phone) return { error: "Informe um celular válido com DDD." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Informe um e-mail válido." };
  if (password.length < 8) return { error: "A senha precisa ter ao menos 8 caracteres." };
  if (formData.get("consent") !== "on") return { error: "Precisamos do seu consentimento para analisar o crédito." };
  const pv = (await activeProductVersions()).find((v) => v.id === pvId);
  if (!pv || !pv.allowed_terms.includes(term)) return { error: "Escolha o valor e o prazo do crédito." };

  const db = adminClient();
  let agentId: string | null = null;
  if (code) {
    const { data } = await db.rpc("wc_public_agent", { p_code: code });
    agentId = (data as { id?: string } | null)?.id ?? null;
    if (!agentId) return { error: "ID do agente não encontrado. Confira com quem indicou você ou deixe em branco." };
  }

  // 1) usuário no Auth
  const { data: created, error: uErr } = await db.auth.admin.createUser({ email, password, email_confirm: true, phone, user_metadata: { full_name: name } });
  if (uErr || !created.user) {
    const msg = uErr?.message ?? "";
    return { error: /already|exists|registered/i.test(msg) ? "Este e-mail já tem conta. Entre com seu e-mail e senha." : `Não foi possível criar o acesso: ${msg}` };
  }
  const uid = created.user.id;
  try {
    const { error: pErr } = await db.from("profiles").insert({ id: uid, role: "client", full_name: name, email, phone });
    if (pErr) throw new Error(pErr.message);
    const reg = await rpc<{ customer_id: string }>("wc_self_register_customer", { p_user_id: uid, p_full_name: name, p_cpf: cpf, p_cpf_hash: cpfHash(cpf), p_phone: phone, p_email: email, p_agent: agentId });
    const prop = await createAndSendProposal(agentId, reg.customer_id, pv.id, term, { skipSms: true });
    const supabase = await createClient();
    const { error: sErr } = await supabase.auth.signInWithPassword({ email, password });
    if (sErr) redirect(`/entrar?ok=1&next=${encodeURIComponent(`/cliente/propostas/${prop.proposalId}`)}`);
    redirect(`/cliente/propostas/${prop.proposalId}?nova=1`);
  } catch (e) {
    if ((e as Error & { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e;
    // desfaz o usuário para permitir nova tentativa
    await db.auth.admin.deleteUser(uid).catch(() => {});
    return { error: (e as Error).message };
  }
}
