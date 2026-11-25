import "server-only";
import type { Channel, ConnectionStatus, MessagingProvider, SendResult } from "./types";
import { EvolutionWhatsApp, ZapiWhatsApp, CloudWhatsApp } from "./whatsapp";
import { adminClient } from "@/lib/supabase/admin";

/** Simulado: registra no banco para conferência no painel DEV; número terminado em 0000 falha. */
class MockProvider implements MessagingProvider {
  constructor(readonly channel: Channel) {}
  readonly name = "mock";
  private async log(to: string, text: string, media: boolean) {
    await adminClient().from("mock_pix_state").insert({
      kind: `msg_${this.channel}`, reference: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, status: "sent",
      payload: { to, text: text.slice(0, 400), media },
    }).then(() => {}, () => {});
  }
  async sendText(to: string, text: string): Promise<SendResult> {
    if (!to) return { ok: false, error: "destinatário vazio" };
    if (to.endsWith("0000")) return { ok: false, error: "operadora recusou a entrega (simulado)" };
    await this.log(to, text, false);
    return { ok: true, providerMessageId: `mock_${Date.now().toString(36)}` };
  }
  async sendImage(to: string, _img: string, caption: string): Promise<SendResult> {
    void _img;
    if (!to) return { ok: false, error: "destinatário vazio" };
    if (to.endsWith("0000")) return { ok: false, error: "operadora recusou a entrega (simulado)" };
    await this.log(to, caption, true);
    return { ok: true, providerMessageId: `mock_${Date.now().toString(36)}` };
  }
  async status(): Promise<ConnectionStatus> { return { connected: true, state: "simulado" }; }
}

/** Twilio para SMS. */
class TwilioSms implements MessagingProvider {
  readonly name = "twilio";
  readonly channel = "sms" as const;
  async sendText(to: string, text: string): Promise<SendResult> {
    const sid = process.env.TWILIO_ACCOUNT_SID!, token = process.env.TWILIO_AUTH_TOKEN!, from = process.env.TWILIO_FROM!;
    try {
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: "POST",
        headers: { Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ To: to, From: from, Body: text }),
      });
      const j = await res.json();
      if (!res.ok) return { ok: false, error: j.message ?? `HTTP ${res.status}` };
      return { ok: true, providerMessageId: j.sid };
    } catch (e) { return { ok: false, error: (e as Error).message }; }
  }
  /** SMS não leva imagem: envia só o texto. */
  async sendImage(to: string, _img: string, caption: string): Promise<SendResult> { void _img; return this.sendText(to, caption); }
}

let waInstance: MessagingProvider | null = null;
let smsInstance: MessagingProvider | null = null;

export function whatsappProvider(): MessagingProvider {
  if (waInstance) return waInstance;
  const p = (process.env.WA_PROVIDER || "mock").toLowerCase();
  waInstance = p === "evolution" ? new EvolutionWhatsApp() : p === "zapi" ? new ZapiWhatsApp() : p === "cloud" ? new CloudWhatsApp() : new MockProvider("whatsapp");
  return waInstance;
}

export function smsProviderM(): MessagingProvider {
  if (smsInstance) return smsInstance;
  smsInstance = (process.env.SMS_PROVIDER || "mock") === "twilio" ? new TwilioSms() : new MockProvider("sms");
  return smsInstance;
}

export function providerFor(channel: Channel): MessagingProvider {
  return channel === "whatsapp" ? whatsappProvider() : smsProviderM();
}

export function whatsappIsLive(): boolean {
  const p = (process.env.WA_PROVIDER || "mock").toLowerCase();
  if (p === "evolution") return !!process.env.WA_EVOLUTION_URL && !!process.env.WA_EVOLUTION_KEY;
  if (p === "zapi") return !!process.env.WA_ZAPI_INSTANCE && !!process.env.WA_ZAPI_TOKEN;
  if (p === "cloud") return !!process.env.WA_CLOUD_TOKEN && !!process.env.WA_CLOUD_PHONE_ID;
  return false;
}

export * from "./types";
