import "server-only";
import { adminClient } from "@/lib/supabase/admin";

export interface CollectionSettings {
  stages: { code: string; offset_days: number }[];
  case_after_days: number;
  window_start: string;
  window_end: string;
  review_pause_hours: number;
  channel: "sms" | "whatsapp";
  whatsapp_authorized: boolean;
  template: string;
}

export const DEFAULT_COLLECTION: CollectionSettings = {
  stages: [{ code: "D0", offset_days: 0 }, { code: "D3", offset_days: 3 }, { code: "D7", offset_days: 7 }],
  case_after_days: 10,
  window_start: "08:00",
  window_end: "20:00",
  review_pause_hours: 48,
  channel: "sms",
  whatsapp_authorized: false,
  template: "WorldCred: parcela {{n}} de {{total}} vence em {{due}}. Pague com Pix pelo portal: {{link}}",
};

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const { data } = await adminClient().from("settings").select("value").eq("key", key).maybeSingle();
  return (data?.value as T) ?? fallback;
}

export async function getCollectionSettings(): Promise<CollectionSettings> {
  const v = await getSetting<Partial<CollectionSettings>>("collection", {});
  return { ...DEFAULT_COLLECTION, ...v };
}

export async function getPixSettings(): Promise<{ charge_ttl_hours: number; receiver_account: string }> {
  return getSetting("pix", { charge_ttl_hours: 24, receiver_account: "WC-SANDBOX-001" });
}
