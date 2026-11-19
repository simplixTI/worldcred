import "server-only";
import QRCode from "qrcode";
import { adminClient } from "@/lib/supabase/admin";
import { pixProvider } from "@/lib/pix";
import { getPixSettings } from "./settings";

export interface ChargeView {
  id: string; reference: string; amount_cents: number; status: string; qr_payload: string; expires_at: string; sequence: number; qr_data_url?: string;
}

/**
 * Garante no máximo uma cobrança utilizável por parcela.
 * Reutiliza a ativa (não expirada, com valor igual ao saldo); caso contrário, supersede e emite nova (histórico preservado).
 */
export async function getOrCreateCharge(installmentId: string, actorId?: string): Promise<ChargeView> {
  const db = adminClient();
  const { data: inst } = await db.from("installments").select("*, contracts(number, customers(full_name, cpf))").eq("id", installmentId).single();
  if (!inst) throw new Error("parcela não encontrada");
  if (inst.status === "paid" || inst.status === "cancelled") throw new Error("parcela não está aberta");
  const balance = Number(inst.amount_cents) - Number(inst.paid_cents);
  const { data: active } = await db.from("pix_charges").select("*").eq("installment_id", installmentId).eq("status", "active").maybeSingle();
  if (active && active.provider === pixProvider().name && new Date(active.expires_at) > new Date(Date.now() + 60_000) && Number(active.amount_cents) === balance) {
    return withQr(active as ChargeView);
  }
  const { count } = await db.from("pix_charges").select("id", { count: "exact", head: true }).eq("installment_id", installmentId);
  const seq = (count ?? 0) + 1;
  if (active) {
    await pixProvider().cancelCharge(active.reference).catch(() => {});
    await db.from("pix_charges").update({ status: new Date(active.expires_at) <= new Date() ? "expired" : "superseded" }).eq("id", active.id);
  }
  const contract = inst.contracts as unknown as { number: string; customers: { full_name: string; cpf: string } };
  const reference = `${contract.number.replace(/-/g, "")}P${String(inst.number).padStart(2, "0")}R${String(seq).padStart(2, "0")}`.slice(0, 35);
  const ttl = (await getPixSettings()).charge_ttl_hours;
  const r = await pixProvider().createCharge({ reference, amountCents: balance, payerName: contract.customers.full_name, payerCpf: contract.customers.cpf, description: `Parcela ${inst.number} contrato ${contract.number}`, expiresInSeconds: ttl * 3600 });
  const { data: created, error } = await db.from("pix_charges").insert({
    installment_id: installmentId, reference, sequence: seq, amount_cents: balance, status: "active", provider: pixProvider().name,
    provider_charge_id: r.providerChargeId, receiver_account: r.receiverAccount, qr_payload: r.qrPayload, expires_at: r.expiresAt, created_by: actorId ?? null,
  }).select("*").single();
  if (error) throw new Error(error.message);
  if (active) await db.from("pix_charges").update({ superseded_by: created.id }).eq("id", active.id);
  return withQr(created as ChargeView);
}

async function withQr(c: ChargeView): Promise<ChargeView> {
  const qr_data_url = await QRCode.toDataURL(c.qr_payload, { margin: 1, width: 280 });
  return { ...c, qr_data_url };
}

/** Rotina: marca como expiradas as cobranças ativas vencidas (confirmando no provedor que não foram pagas). */
export async function expireCharges() {
  const db = adminClient();
  const { data } = await db.from("pix_charges").select("id, reference").eq("status", "active").lt("expires_at", new Date().toISOString());
  let expired = 0, paidLate = 0;
  for (const c of data ?? []) {
    const st = await pixProvider().getCharge(c.reference).catch(() => null);
    if (st?.status === "paid") { paidLate++; continue; } // o webhook/conciliação registrará o pagamento
    await db.from("pix_charges").update({ status: "expired" }).eq("id", c.id);
    expired++;
  }
  return { expired, paid_pending_webhook: paidLate };
}
