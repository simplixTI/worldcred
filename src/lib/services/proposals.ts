import "server-only";
import { adminClient, rpc } from "@/lib/supabase/admin";
import { buildSchedule, type ScheduleSnapshot } from "@/lib/finance/price";
import { smsProvider } from "@/lib/sms";
import { getSetting } from "./settings";
import { createPortalLink } from "./links";

export interface ProductVersionRow {
  id: string; product_id: string; version: number; monthly_rate: string; allowed_terms: number[]; fee_cents: number;
  iof_enabled: boolean; iof_daily_rate: string; iof_fixed_rate: string; valid_from: string; valid_to: string | null;
  products: { id: string; name: string; principal_cents: number; active: boolean; modality: string };
}

/** Versão vigente de cada produto ativo (a mais recente com valid_from <= hoje e sem valid_to passado). */
export async function activeProductVersions(): Promise<ProductVersionRow[]> {
  const { data, error } = await adminClient()
    .from("product_versions")
    .select("*, products!inner(id, name, principal_cents, active, modality)")
    .eq("products.active", true)
    .eq("products.modality", "fixed")
    .lte("valid_from", new Date().toISOString().slice(0, 10))
    .order("version", { ascending: false });
  if (error) throw new Error(error.message);
  const seen = new Set<string>();
  const out: ProductVersionRow[] = [];
  for (const row of (data ?? []) as unknown as ProductVersionRow[]) {
    if (row.valid_to && row.valid_to < new Date().toISOString().slice(0, 10)) continue;
    if (seen.has(row.product_id)) continue;
    seen.add(row.product_id);
    out.push(row);
  }
  return out.sort((a, b) => a.products.principal_cents - b.products.principal_cents);
}

export function simulate(pv: ProductVersionRow, termMonths: number): ScheduleSnapshot {
  if (!pv.allowed_terms.includes(termMonths)) throw new Error("prazo não permitido para este produto");
  return buildSchedule({
    principalCents: pv.products.principal_cents,
    monthlyRate: pv.monthly_rate,
    termMonths,
    feeCents: pv.fee_cents,
    iof: pv.iof_enabled ? { enabled: true, dailyRate: pv.iof_daily_rate, fixedRate: pv.iof_fixed_rate } : null,
  });
}

/** Agente cria a proposta e a envia para aceite do cliente (SMS com link). */
export async function createAndSendProposal(agentId: string, customerId: string, productVersionId: string, termMonths: number) {
  const db = adminClient();
  const { data: link } = await db.from("agent_customers").select("customer_id").eq("agent_id", agentId).eq("customer_id", customerId).maybeSingle();
  if (!link) throw new Error("cliente fora da sua carteira");
  const versions = await activeProductVersions();
  const pv = versions.find((v) => v.id === productVersionId);
  if (!pv) throw new Error("produto indisponível");
  const snapshot = simulate(pv, termMonths);
  const { data: lender } = await db.from("lenders").select("id").eq("active", true).limit(1).single();
  const expiresHours = (await getSetting<{ expires_hours: number }>("proposal", { expires_hours: 72 })).expires_hours;
  const { data: p, error } = await db.from("proposals").insert({
    customer_id: customerId, agent_id: agentId, lender_id: lender!.id, product_version_id: pv.id,
    principal_cents: pv.products.principal_cents, term_months: termMonths, monthly_rate: pv.monthly_rate,
    schedule_snapshot: { ...snapshot, product: { id: pv.product_id, name: pv.products.name, version: pv.version } },
    status: "sent", sent_at: new Date().toISOString(), expires_at: new Date(Date.now() + expiresHours * 3600_000).toISOString(),
  }).select("id, number").single();
  if (error) throw new Error(error.message);
  await rpc("wc_audit", { p_action: "proposal.send", p_entity: "proposals", p_entity_id: p.id, p_meta: { agent: agentId } }).catch(() => {});
  const { data: c } = await db.from("customers").select("phone").eq("id", customerId).single();
  const { url } = await createPortalLink(customerId, null, 72);
  const sms = await smsProvider().send(c?.phone ?? "", `WorldCred: sua proposta de crédito está pronta para leitura e aceite: ${url}`);
  return { proposalId: p.id as string, number: p.number as number, smsOk: sms.ok };
}
