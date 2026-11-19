import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";

export type Role = "admin" | "agent" | "client";

export interface SessionInfo {
  userId: string;
  email: string | null;
  role: Role;
  fullName: string;
  active: boolean;
  aal: "aal1" | "aal2";
  mfaEnrolled: boolean;
}

/** Lê usuário, perfil e nível de garantia (MFA) da sessão atual. */
export async function getSession(): Promise<SessionInfo | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("role, full_name, active").eq("id", user.id).maybeSingle();
  if (!profile) return null;
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const enrolled = (factors?.totp ?? []).some((f) => f.status === "verified");
  return {
    userId: user.id,
    email: user.email ?? null,
    role: profile.role as Role,
    fullName: profile.full_name,
    active: profile.active,
    aal: (aal?.currentLevel as "aal1" | "aal2") ?? "aal1",
    mfaEnrolled: enrolled,
  };
}

export async function mfaRequiredForRole(role: Role): Promise<boolean> {
  if (role === "client") return false;
  if (env.mfaEnforcement === "off") return false;
  const { data } = await adminClient().from("settings").select("value").eq("key", "security").maybeSingle();
  return (data?.value?.mfa_enforced ?? true) === true;
}

/** Exige sessão com um dos perfis. Redireciona para login/MFA quando necessário. */
export async function requireRole(roles: Role[], opts: { mfa?: boolean } = {}): Promise<SessionInfo> {
  const s = await getSession();
  if (!s) redirect("/entrar");
  if (!s.active) redirect("/entrar?erro=inativo");
  if (!roles.includes(s.role)) redirect(homeFor(s.role));
  const needMfa = opts.mfa ?? (s.role === "admin");
  if (needMfa && (await mfaRequiredForRole(s.role)) && s.aal !== "aal2") redirect("/mfa");
  return s;
}

/** Variante para Server Actions: lança erro em vez de redirecionar. */
export async function assertRole(roles: Role[], opts: { mfa?: boolean } = {}): Promise<SessionInfo> {
  const s = await getSession();
  if (!s || !s.active) throw new Error("Sessão inválida");
  if (!roles.includes(s.role)) throw new Error("Perfil não autorizado");
  const needMfa = opts.mfa ?? (s.role === "admin");
  if (needMfa && (await mfaRequiredForRole(s.role)) && s.aal !== "aal2") throw new Error("Esta ação exige autenticação em dois fatores (MFA)");
  return s;
}

export function homeFor(role: Role): string {
  return role === "admin" ? "/admin" : role === "agent" ? "/agente" : "/cliente";
}

/** Painel DEV: admin cujo e-mail está em DEV_EMAILS. */
export function isDev(s: SessionInfo | null): boolean {
  return !!s && s.role === "admin" && !!s.email && env.devEmails.includes(s.email.toLowerCase());
}
