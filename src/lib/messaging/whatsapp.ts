import "server-only";
import type { ConnectionStatus, MessagingProvider, SendResult } from "./types";
import { stripDataUrl, toWhatsAppNumber } from "./types";

const TIMEOUT = 20_000;

async function call(url: string, init: RequestInit): Promise<{ ok: boolean; status: number; json: Record<string, unknown>; text: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
    const text = await res.text();
    let json: Record<string, unknown> = {};
    try { json = JSON.parse(text); } catch { /* resposta não-JSON */ }
    return { ok: res.ok, status: res.status, json, text };
  } finally { clearTimeout(t); }
}

/**
 * Evolution API (autohospedada, pareada com um telefone lendo o QR).
 * Env: WA_EVOLUTION_URL, WA_EVOLUTION_KEY, WA_EVOLUTION_INSTANCE.
 */
export class EvolutionWhatsApp implements MessagingProvider {
  readonly name = "evolution";
  readonly channel = "whatsapp" as const;
  private base = (process.env.WA_EVOLUTION_URL || "").replace(/\/$/, "");
  private key = process.env.WA_EVOLUTION_KEY || "";
  private instance = process.env.WA_EVOLUTION_INSTANCE || "worldcred";
  private get headers() { return { "Content-Type": "application/json", apikey: this.key }; }

  async sendText(to: string, text: string): Promise<SendResult> {
    const number = toWhatsAppNumber(to);
    if (!number) return { ok: false, error: "destinatário vazio" };
    try {
      const r = await call(`${this.base}/message/sendText/${this.instance}`, { method: "POST", headers: this.headers, body: JSON.stringify({ number, text, delay: 800 }) });
      if (!r.ok) return { ok: false, error: `Evolution ${r.status}: ${r.text.slice(0, 140)}`, unreachable: r.status === 400 };
      return { ok: true, providerMessageId: String((r.json.key as { id?: string } | undefined)?.id ?? r.json.id ?? "") };
    } catch (e) { return { ok: false, error: (e as Error).name === "AbortError" ? "tempo limite no WhatsApp" : (e as Error).message }; }
  }

  async sendImage(to: string, imageBase64: string, caption: string, filename = "pix.png"): Promise<SendResult> {
    const number = toWhatsAppNumber(to);
    if (!number) return { ok: false, error: "destinatário vazio" };
    try {
      const r = await call(`${this.base}/message/sendMedia/${this.instance}`, {
        method: "POST", headers: this.headers,
        body: JSON.stringify({ number, mediatype: "image", mimetype: "image/png", media: stripDataUrl(imageBase64), caption, fileName: filename, delay: 800 }),
      });
      if (!r.ok) return { ok: false, error: `Evolution ${r.status}: ${r.text.slice(0, 140)}` };
      return { ok: true, providerMessageId: String((r.json.key as { id?: string } | undefined)?.id ?? r.json.id ?? "") };
    } catch (e) { return { ok: false, error: (e as Error).message }; }
  }

  async status(): Promise<ConnectionStatus> {
    try {
      const r = await call(`${this.base}/instance/connectionState/${this.instance}`, { method: "GET", headers: this.headers });
      const state = String((r.json.instance as { state?: string } | undefined)?.state ?? r.json.state ?? "desconhecido");
      return { connected: state === "open", state, detail: r.ok ? undefined : r.text.slice(0, 140) };
    } catch (e) { return { connected: false, state: "erro", detail: (e as Error).message }; }
  }

  async pairingQr() {
    const r = await call(`${this.base}/instance/connect/${this.instance}`, { method: "GET", headers: this.headers });
    const base64 = (r.json.base64 as string) ?? (r.json.qrcode as { base64?: string } | undefined)?.base64;
    return { qrBase64: base64, pairingCode: (r.json.pairingCode as string) ?? undefined, state: r.ok ? "aguardando leitura" : `erro ${r.status}` };
  }
}

/**
 * Z-API (serviço brasileiro, também pareado com telefone).
 * Env: WA_ZAPI_INSTANCE, WA_ZAPI_TOKEN, WA_ZAPI_CLIENT_TOKEN.
 */
export class ZapiWhatsApp implements MessagingProvider {
  readonly name = "zapi";
  readonly channel = "whatsapp" as const;
  private base = `https://api.z-api.io/instances/${process.env.WA_ZAPI_INSTANCE}/token/${process.env.WA_ZAPI_TOKEN}`;
  private get headers() { return { "Content-Type": "application/json", "Client-Token": process.env.WA_ZAPI_CLIENT_TOKEN || "" }; }

  async sendText(to: string, text: string): Promise<SendResult> {
    const phone = toWhatsAppNumber(to);
    if (!phone) return { ok: false, error: "destinatário vazio" };
    try {
      const r = await call(`${this.base}/send-text`, { method: "POST", headers: this.headers, body: JSON.stringify({ phone, message: text }) });
      if (!r.ok) return { ok: false, error: `Z-API ${r.status}: ${r.text.slice(0, 140)}` };
      return { ok: true, providerMessageId: String(r.json.messageId ?? r.json.id ?? "") };
    } catch (e) { return { ok: false, error: (e as Error).message }; }
  }

  async sendImage(to: string, imageBase64: string, caption: string): Promise<SendResult> {
    const phone = toWhatsAppNumber(to);
    if (!phone) return { ok: false, error: "destinatário vazio" };
    const dataUrl = imageBase64.startsWith("data:") ? imageBase64 : `data:image/png;base64,${imageBase64}`;
    try {
      const r = await call(`${this.base}/send-image`, { method: "POST", headers: this.headers, body: JSON.stringify({ phone, image: dataUrl, caption }) });
      if (!r.ok) return { ok: false, error: `Z-API ${r.status}: ${r.text.slice(0, 140)}` };
      return { ok: true, providerMessageId: String(r.json.messageId ?? r.json.id ?? "") };
    } catch (e) { return { ok: false, error: (e as Error).message }; }
  }

  async status(): Promise<ConnectionStatus> {
    try {
      const r = await call(`${this.base}/status`, { method: "GET", headers: this.headers });
      const connected = r.json.connected === true;
      return { connected, state: connected ? "open" : String(r.json.error ?? r.json.smartphoneConnected ?? "desconectado") };
    } catch (e) { return { connected: false, state: "erro", detail: (e as Error).message }; }
  }

  async pairingQr() {
    const r = await call(`${this.base}/qr-code/image`, { method: "GET", headers: this.headers });
    return { qrBase64: (r.json.value as string) ?? undefined, state: r.ok ? "aguardando leitura" : `erro ${r.status}` };
  }
}

/**
 * WhatsApp Cloud API (oficial da Meta). Mensagens fora da janela de 24h exigem template aprovado.
 * Env: WA_CLOUD_TOKEN, WA_CLOUD_PHONE_ID, WA_CLOUD_TEMPLATE (opcional).
 */
export class CloudWhatsApp implements MessagingProvider {
  readonly name = "cloud";
  readonly channel = "whatsapp" as const;
  private base = `https://graph.facebook.com/v21.0/${process.env.WA_CLOUD_PHONE_ID}/messages`;
  private get headers() { return { "Content-Type": "application/json", Authorization: `Bearer ${process.env.WA_CLOUD_TOKEN}` }; }

  async sendText(to: string, text: string): Promise<SendResult> {
    const number = toWhatsAppNumber(to);
    try {
      const r = await call(this.base, { method: "POST", headers: this.headers, body: JSON.stringify({ messaging_product: "whatsapp", to: number, type: "text", text: { body: text, preview_url: true } }) });
      if (!r.ok) return { ok: false, error: `Meta ${r.status}: ${((r.json.error as { message?: string } | undefined)?.message ?? r.text).slice(0, 140)}` };
      return { ok: true, providerMessageId: String((r.json.messages as { id?: string }[] | undefined)?.[0]?.id ?? "") };
    } catch (e) { return { ok: false, error: (e as Error).message }; }
  }

  /** A Cloud API não aceita base64: precisa de mídia hospedada. Enviamos o texto com o link do portal. */
  async sendImage(to: string, _imageBase64: string, caption: string): Promise<SendResult> {
    void _imageBase64;
    return this.sendText(to, caption);
  }

  async status(): Promise<ConnectionStatus> {
    return { connected: !!process.env.WA_CLOUD_TOKEN && !!process.env.WA_CLOUD_PHONE_ID, state: process.env.WA_CLOUD_TOKEN ? "api oficial" : "sem credencial" };
  }
}
