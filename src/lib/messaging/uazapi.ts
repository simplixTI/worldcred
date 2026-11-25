import "server-only";
import type { ConnectionStatus, MessagingProvider, SendResult } from "./types";
import { stripDataUrl, toWhatsAppNumber } from "./types";

/**
 * uazapi (https://uazapi.com) — WhatsApp pareado com telefone.
 * Env: WA_UAZAPI_URL (ex.: https://sua-instancia.uazapi.com), WA_UAZAPI_TOKEN (token da instância),
 *      WA_UAZAPI_ADMIN_TOKEN (opcional, para operações de instância).
 *
 * Os endpoints seguem a API v2 (/send/text, /send/media, /instance/status, /instance/connect).
 * O parser é tolerante: aceita variações de formato e guarda a resposta crua para diagnóstico no painel DEV.
 */
const TIMEOUT = 20_000;

let lastRaw: { at: string; path: string; status: number; body: string } | null = null;
export function uazapiLastResponse() { return lastRaw; }

export class UazapiWhatsApp implements MessagingProvider {
  readonly name = "uazapi";
  readonly channel = "whatsapp" as const;
  private base = (process.env.WA_UAZAPI_URL || "").replace(/\/$/, "");
  private token = process.env.WA_UAZAPI_TOKEN || "";
  private adminToken = process.env.WA_UAZAPI_ADMIN_TOKEN || "";

  private async call(path: string, init: RequestInit, useAdmin = false) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT);
    try {
      const res = await fetch(`${this.base}${path}`, {
        ...init, signal: ctrl.signal, cache: "no-store",
        headers: { "Content-Type": "application/json", token: this.token, ...(useAdmin && this.adminToken ? { admintoken: this.adminToken } : {}), ...(init.headers ?? {}) },
      });
      const text = await res.text();
      lastRaw = { at: new Date().toISOString(), path, status: res.status, body: text.slice(0, 600) };
      let json: Record<string, unknown> = {};
      try { json = JSON.parse(text); } catch { /* resposta não-JSON */ }
      return { ok: res.ok, status: res.status, json, text };
    } finally { clearTimeout(t); }
  }

  private idOf(j: Record<string, unknown>): string | undefined {
    const direct = j.id ?? j.messageid ?? j.messageId;
    if (typeof direct === "string") return direct;
    const key = (j.key ?? (j.message as Record<string, unknown> | undefined)?.key) as { id?: string } | undefined;
    return key?.id ?? ((j.message as { id?: string } | undefined)?.id);
  }

  async sendText(to: string, text: string): Promise<SendResult> {
    const number = toWhatsAppNumber(to);
    if (!number) return { ok: false, error: "destinatário vazio" };
    if (!this.base || !this.token) return { ok: false, error: "uazapi sem URL ou token configurados" };
    try {
      const r = await this.call("/send/text", { method: "POST", body: JSON.stringify({ number, text, delay: 1200, readchat: true }) });
      if (!r.ok) return { ok: false, error: `uazapi ${r.status}: ${(r.json.error ?? r.text).toString().slice(0, 140)}`, unreachable: r.status === 400 || r.status === 404 };
      return { ok: true, providerMessageId: this.idOf(r.json) };
    } catch (e) { return { ok: false, error: (e as Error).name === "AbortError" ? "tempo limite no WhatsApp" : (e as Error).message }; }
  }

  async sendImage(to: string, imageBase64: string, caption: string, filename = "pix.png"): Promise<SendResult> {
    const number = toWhatsAppNumber(to);
    if (!number) return { ok: false, error: "destinatário vazio" };
    if (!this.base || !this.token) return { ok: false, error: "uazapi sem URL ou token configurados" };
    const file = imageBase64.startsWith("data:") ? imageBase64 : `data:image/png;base64,${stripDataUrl(imageBase64)}`;
    try {
      const r = await this.call("/send/media", { method: "POST", body: JSON.stringify({ number, type: "image", file, text: caption, docName: filename, delay: 1200 }) });
      if (!r.ok) return { ok: false, error: `uazapi ${r.status}: ${(r.json.error ?? r.text).toString().slice(0, 140)}` };
      return { ok: true, providerMessageId: this.idOf(r.json) };
    } catch (e) { return { ok: false, error: (e as Error).message }; }
  }

  async status(): Promise<ConnectionStatus> {
    if (!this.base || !this.token) return { connected: false, state: "sem credenciais" };
    try {
      const r = await this.call("/instance/status", { method: "GET" });
      const inst = (r.json.instance ?? r.json) as Record<string, unknown>;
      const state = String(inst.status ?? inst.state ?? r.json.status ?? "desconhecido");
      const connected = ["connected", "open", "online"].includes(state.toLowerCase()) || r.json.connected === true;
      return { connected, state, number: (inst.owner ?? inst.phone ?? inst.profileName) as string | undefined, detail: r.ok ? undefined : r.text.slice(0, 140) };
    } catch (e) { return { connected: false, state: "erro", detail: (e as Error).message }; }
  }

  async pairingQr() {
    const r = await this.call("/instance/connect", { method: "POST", body: JSON.stringify({}) }, true);
    const inst = (r.json.instance ?? r.json) as Record<string, unknown>;
    const qr = (r.json.qrcode ?? inst.qrcode ?? r.json.base64 ?? inst.qrCode) as string | undefined;
    const code = (r.json.paircode ?? inst.paircode ?? r.json.pairingCode) as string | undefined;
    const state = String(inst.status ?? r.json.status ?? (r.ok ? "aguardando leitura" : `erro ${r.status}`));
    return { qrBase64: qr, pairingCode: code, state };
  }
}
