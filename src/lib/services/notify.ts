import "server-only";
import { providerFor, whatsappIsLive } from "@/lib/messaging";
import { getCollectionSettings } from "./settings";

/**
 * Avisos avulsos ao cliente (convite, proposta): tenta WhatsApp quando conectado e autorizado,
 * com queda para SMS. Nunca lança: o chamador segue mesmo sem entrega.
 */
export async function notifyCustomer(phone: string, text: string): Promise<{ ok: boolean; channel: "whatsapp" | "sms"; error?: string }> {
  if (!phone) return { ok: false, channel: "sms", error: "sem telefone" };
  const cfg = await getCollectionSettings().catch(() => null);
  const canWa = cfg?.channel === "whatsapp" && cfg.whatsapp_authorized && whatsappIsLive();
  if (canWa) {
    const r = await providerFor("whatsapp").sendText(phone, `${text}\n\n_WorldCred_`).catch((e) => ({ ok: false, error: (e as Error).message }));
    if (r.ok) return { ok: true, channel: "whatsapp" };
    if (cfg?.fallback_sms === false) return { ok: false, channel: "whatsapp", error: r.error };
  }
  const r = await providerFor("sms").sendText(phone, text).catch((e) => ({ ok: false, error: (e as Error).message }));
  return { ok: r.ok, channel: "sms", error: r.ok ? undefined : r.error };
}
