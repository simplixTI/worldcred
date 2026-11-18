import "server-only";
import { env } from "@/lib/env";

export interface SmsResult { ok: boolean; providerMessageId?: string; error?: string; }
export interface SmsProvider {
  readonly name: string;
  send(to: string, body: string): Promise<SmsResult>;
}

/** Simulado: telefones terminados em 0000 falham de forma determinística (teste de "falha no SMS"). */
class MockSmsProvider implements SmsProvider {
  readonly name = "mock";
  async send(to: string, body: string): Promise<SmsResult> {
    if (!to) return { ok: false, error: "destinatário vazio" };
    if (to.endsWith("0000")) return { ok: false, error: "operadora recusou a entrega (simulado)" };
    void body;
    return { ok: true, providerMessageId: `mocksms_${Date.now().toString(36)}` };
  }
}

/** Twilio (esqueleto). Requer TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM. */
class TwilioSmsProvider implements SmsProvider {
  readonly name = "twilio";
  async send(to: string, body: string): Promise<SmsResult> {
    const sid = process.env.TWILIO_ACCOUNT_SID!, token = process.env.TWILIO_AUTH_TOKEN!, from = process.env.TWILIO_FROM!;
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: to, From: from, Body: body }),
    });
    const j = await res.json();
    if (!res.ok) return { ok: false, error: j.message ?? `HTTP ${res.status}` };
    return { ok: true, providerMessageId: j.sid };
  }
}

let instance: SmsProvider | null = null;
export function smsProvider(): SmsProvider {
  if (instance) return instance;
  instance = env.smsProvider === "twilio" ? new TwilioSmsProvider() : new MockSmsProvider();
  return instance;
}
