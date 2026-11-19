/** Acesso centralizado às variáveis de ambiente. Segredos ficam somente no servidor. */
function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variável de ambiente ausente: ${name}`);
  return v;
}

export const env = {
  get supabaseUrl() { return req("NEXT_PUBLIC_SUPABASE_URL"); },
  get supabaseAnonKey() { return req("NEXT_PUBLIC_SUPABASE_ANON_KEY"); },
  get supabaseServiceRoleKey() { return req("SUPABASE_SERVICE_ROLE_KEY"); },
  get appUrl() { return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"; },
  get cronSecret() { return req("CRON_SECRET"); },
  get pixProvider() { return process.env.PIX_PROVIDER || "mock"; },
  get pixWebhookSecret() { return req("PIX_WEBHOOK_SECRET"); },
  get smsProvider() { return process.env.SMS_PROVIDER || "mock"; },
  get mfaEnforcement(): "on" | "off" {
    const v = process.env.MFA_ENFORCEMENT || "on";
    if (v === "off" && process.env.NODE_ENV === "production") return "on";
    return v === "off" ? "off" : "on";
  },
  get isSandbox() { return ["mock", "mercadopago"].includes(process.env.PIX_PROVIDER || "mock"); },
  get chargesAreReal() { return (process.env.PIX_PROVIDER || "mock") !== "mock"; },
  get devEmails(): string[] { return (process.env.DEV_EMAILS || "brucnascimento@gmail.com").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean); },
  get linkSecret() { return process.env.PORTAL_LINK_SECRET || req("CRON_SECRET"); },
};
