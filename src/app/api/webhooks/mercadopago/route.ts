import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { verifyWebhookSignature } from "@/lib/card/mercadopago";
import { syncCardPayment } from "@/lib/services/card";
import { syncPixPayment } from "@/lib/services/mp-pix";

export const dynamic = "force-dynamic";

/** Webhook do Mercado Pago: valida assinatura, registra o evento (idempotente) e sincroniza o pagamento consultando a API. */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const raw = await req.text();
  let body: { action?: string; type?: string; data?: { id?: string | number } } = {};
  try { body = JSON.parse(raw); } catch { /* corpo vazio */ }
  const dataId = String(body.data?.id ?? url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? "");
  const type = body.type ?? url.searchParams.get("type") ?? url.searchParams.get("topic") ?? "";
  const headers: Record<string, string | null> = {};
  for (const [k, v] of req.headers.entries()) headers[k.toLowerCase()] = v;
  const valid = verifyWebhookSignature(headers, dataId || null);
  const db = adminClient();
  const { data: ev, error } = await db.from("provider_events").insert({ provider: "mercadopago", external_id: `${type}:${dataId}:${headers["x-request-id"] ?? Date.now()}`, kind: `${type}.${body.action ?? "notify"}`, reference: dataId, payload: { type, action: body.action, data_id: dataId }, signature_valid: valid }).select("id").maybeSingle();
  if (error && error.code === "23505") return NextResponse.json({ outcome: "already_processed" });
  if (!valid) return NextResponse.json({ error: "assinatura inválida" }, { status: 401 });
  if (type !== "payment" || !dataId) return NextResponse.json({ outcome: "ignored" });
  try {
    const result = await syncPixPayment(dataId).then((r) => (r.outcome === "not_pix" ? syncCardPayment(dataId) : r));
    if (ev) await db.from("provider_events").update({ processed_at: new Date().toISOString(), result }).eq("id", ev.id);
    return NextResponse.json(result);
  } catch (e) {
    if (ev) await db.from("provider_events").update({ processed_at: new Date().toISOString(), result: { error: (e as Error).message } }).eq("id", ev.id);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
