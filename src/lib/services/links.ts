import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { adminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";

export function hashToken(token: string): string {
  return createHash("sha256").update(token + env.linkSecret).digest("hex");
}

/** Cria um link curto autenticado para o portal do cliente (usado em SMS). */
export async function createPortalLink(customerId: string, installmentId: string | null, ttlHours = 72): Promise<{ url: string; tokenHash: string }> {
  const token = randomBytes(16).toString("base64url");
  const tokenHash = hashToken(token);
  const { error } = await adminClient().from("portal_links").insert({
    token_hash: tokenHash, customer_id: customerId, installment_id: installmentId,
    expires_at: new Date(Date.now() + ttlHours * 3600_000).toISOString(),
  });
  if (error) throw new Error(error.message);
  return { url: `${env.appUrl}/l/${token}`, tokenHash };
}

/** Resolve o token: devolve destino e, se o cliente tiver conta, um magic link de login. */
export async function resolvePortalLink(token: string): Promise<{ redirectTo: string } | { error: string }> {
  const db = adminClient();
  const { data: link } = await db.from("portal_links").select("*, customers(id, email, user_id)").eq("token_hash", hashToken(token)).maybeSingle();
  if (!link) return { error: "Link inválido." };
  if (new Date(link.expires_at) < new Date()) return { error: "Este link expirou. Acesse o portal e entre com seu e-mail." };
  await db.from("portal_links").update({ used_at: new Date().toISOString() }).eq("id", link.id);
  const customer = link.customers as unknown as { id: string; email: string | null; user_id: string | null };
  const target = link.installment_id ? `/cliente/parcelas/${link.installment_id}` : "/cliente";
  if (!customer.user_id || !customer.email) return { redirectTo: `/entrar?next=${encodeURIComponent(target)}` };
  const { data, error } = await db.auth.admin.generateLink({ type: "magiclink", email: customer.email, options: { redirectTo: `${env.appUrl}/auth/callback?next=${encodeURIComponent(target)}` } });
  if (error || !data?.properties?.hashed_token) return { redirectTo: `/entrar?next=${encodeURIComponent(target)}` };
  // verificação via token_hash no nosso callback (sem expor e-mail na URL)
  return { redirectTo: `/auth/callback?token_hash=${data.properties.hashed_token}&type=magiclink&next=${encodeURIComponent(target)}` };
}
