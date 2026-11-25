/** Camada única de mensagens: SMS e WhatsApp (texto e imagem). */

export type Channel = "sms" | "whatsapp";

export interface SendResult {
  ok: boolean;
  providerMessageId?: string;
  error?: string;
  /** true quando o destinatário não existe no canal (ex.: número sem WhatsApp) */
  unreachable?: boolean;
}

export interface MessagingProvider {
  readonly name: string;
  readonly channel: Channel;
  /** Envia texto simples. */
  sendText(to: string, text: string): Promise<SendResult>;
  /** Envia imagem (data URL ou base64 puro) com legenda. Provedores sem suporte caem no texto. */
  sendImage(to: string, imageBase64: string, caption: string, filename?: string): Promise<SendResult>;
  /** Estado da conexão (para WhatsApp pareado por telefone). */
  status?(): Promise<ConnectionStatus>;
  /** QR de pareamento quando o provedor exige telefone conectado. */
  pairingQr?(): Promise<{ qrBase64?: string; pairingCode?: string; state: string }>;
}

export interface ConnectionStatus {
  connected: boolean;
  state: string;
  detail?: string;
  number?: string;
}

/** Normaliza para o formato que os provedores de WhatsApp esperam (DDI+DDD+número, só dígitos). */
export function toWhatsAppNumber(phoneE164: string): string {
  const d = (phoneE164 || "").replace(/\D/g, "");
  if (!d) return "";
  return d.startsWith("55") ? d : `55${d}`;
}

export function stripDataUrl(image: string): string {
  const i = image.indexOf("base64,");
  return i >= 0 ? image.slice(i + 7) : image;
}
