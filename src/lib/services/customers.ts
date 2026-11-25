import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { adminClient, rpc } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { pixProvider } from "@/lib/pix";
import { notifyCustomer } from "./notify";
import { detectPixKeyType, isValidCPF, normalizePhoneBR, onlyDigits } from "@/lib/utils/mask";
import { hashToken } from "./links";

export function cpfHash(cpf: string): string {
  return createHash("sha256").update(onlyDigits(cpf)).digest("hex");
}

export interface NewCustomerInput { fullName: string; cpf: string; phone: string; email?: string | null; }

/** Agente cadastra (ou reutiliza) cliente e vincula à carteira. */
export async function registerCustomer(agentId: string, input: NewCustomerInput): Promise<{ customerId: string; reused: boolean }> {
  if (!isValidCPF(input.cpf)) throw new Error("CPF inválido");
  const phone = normalizePhoneBR(input.phone);
  if (!phone) throw new Error("Telefone inválido");
  const cpf = onlyDigits(input.cpf);
  const rows = await rpc<{ customer_id: string; reused: boolean }[]>("wc_find_or_link_customer", {
    p_full_name: input.fullName.trim(), p_cpf: cpf, p_cpf_hash: cpfHash(cpf), p_phone: phone, p_email: input.email?.trim() || null, p_agent: agentId,
  });
  const r = rows[0];
  return { customerId: r.customer_id, reused: r.reused };
}

/** Gera convite para o cliente criar o próprio acesso; envia SMS com link. */
export async function inviteCustomer(customerId: string): Promise<{ inviteUrl: string; sms: { ok: boolean; error?: string } }> {
  const db = adminClient();
  const { data: c } = await db.from("customers").select("id, phone, full_name, user_id").eq("id", customerId).single();
  if (!c) throw new Error("cliente não encontrado");
  if (c.user_id) throw new Error("cliente já possui acesso");
  const token = randomBytes(18).toString("base64url");
  await db.from("customers").update({ invite_token_hash: hashToken(token), invite_expires_at: new Date(Date.now() + 7 * 86400_000).toISOString() }).eq("id", customerId);
  const inviteUrl = `${env.appUrl}/convite/${token}`;
  const sms = await notifyCustomer(c.phone ?? "", `Olá, ${(c.full_name || "").split(" ")[0]}! Crie seu acesso ao portal da WorldCred para acompanhar sua proposta: ${inviteUrl}`);
  await rpc("wc_audit", { p_action: "customer.invite", p_entity: "customers", p_entity_id: customerId, p_meta: { ok: sms.ok, channel: sms.channel } }).catch(() => {});
  return { inviteUrl, sms };
}

/** Cliente aceita o convite: cria usuário com e-mail/senha e vincula ao cadastro. */
export async function acceptInvite(token: string, email: string, password: string): Promise<{ userId: string }> {
  const db = adminClient();
  const { data: c } = await db.from("customers").select("id, full_name, phone, user_id, invite_expires_at").eq("invite_token_hash", hashToken(token)).maybeSingle();
  if (!c) throw new Error("Convite inválido");
  if (c.user_id) throw new Error("Convite já utilizado");
  if (c.invite_expires_at && new Date(c.invite_expires_at) < new Date()) throw new Error("Convite expirado; peça um novo ao seu agente");
  if (password.length < 8) throw new Error("A senha deve ter ao menos 8 caracteres");
  const { data: created, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, phone: c.phone ?? undefined, user_metadata: { full_name: c.full_name } });
  if (error || !created.user) throw new Error(error?.message ?? "não foi possível criar o usuário");
  const uid = created.user.id;
  const { error: pErr } = await db.from("profiles").insert({ id: uid, role: "client", full_name: c.full_name, email, phone: c.phone });
  if (pErr) throw new Error(pErr.message);
  await db.from("customers").update({ user_id: uid, email, invite_token_hash: null, invite_expires_at: null }).eq("id", c.id);
  return { userId: uid };
}

/** Cliente cadastra a chave Pix; titularidade confirmada pelo fluxo do parceiro (DICT/validação). */
export async function setPixKey(userId: string, pixKey: string) {
  const db = adminClient();
  const { data: c } = await db.from("customers").select("id, cpf").eq("user_id", userId).single();
  if (!c) throw new Error("cadastro não encontrado");
  const key = pixKey.trim();
  const type = detectPixKeyType(key);
  if (!type) throw new Error("Chave Pix em formato não reconhecido");
  await db.from("customers").update({ pix_key: key, pix_key_type: type, pix_key_status: "pending", pix_key_validation: null }).eq("id", c.id);
  const result = await pixProvider().validateKey(key, c.cpf);
  await db.from("customers").update({
    pix_key_status: result.valid ? "validated" : "rejected",
    pix_key_validation: { provider: pixProvider().name, at: new Date().toISOString(), owner_name: result.ownerNameMasked, owner_document: result.ownerDocumentMasked, matches: result.ownerDocumentMatches, reason: result.reason },
  }).eq("id", c.id);
  await rpc("wc_audit", { p_action: "customer.pix_key", p_entity: "customers", p_entity_id: c.id, p_meta: { status: result.valid ? "validated" : "rejected", reason: result.reason ?? null } }).catch(() => {});
  return result;
}
