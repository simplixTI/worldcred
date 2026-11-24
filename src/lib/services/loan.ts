import "server-only";
import { adminClient, rpc } from "@/lib/supabase/admin";
import { buildSchedule } from "@/lib/finance/price";
import { getSetting } from "./settings";

export interface LoanSettings { monthly_rate: string; min_cents: number; max_cents: number; step_cents: number; min_term: number; max_term: number; }
export const DEFAULT_LOAN: LoanSettings = { monthly_rate: "0.15", min_cents: 50000, max_cents: 1000000, step_cents: 10000, min_term: 4, max_term: 20 };

export async function getLoanSettings(): Promise<LoanSettings> {
  return { ...DEFAULT_LOAN, ...(await getSetting<Partial<LoanSettings>>("loan", {})) };
}

export function validateLoanChoice(cfg: LoanSettings, principalCents: number, term: number) {
  if (!Number.isInteger(principalCents) || principalCents < cfg.min_cents || principalCents > cfg.max_cents || principalCents % cfg.step_cents !== 0) throw new Error("Valor fora dos limites permitidos");
  if (!Number.isInteger(term) || term < cfg.min_term || term > cfg.max_term) throw new Error("Prazo fora dos limites permitidos");
}

/** Proposta de crédito padrão com valor livre (prestações mensais via Pix). agentId nulo = sem indicação. */
export async function createFlexibleProposal(agentId: string | null, customerId: string, principalCents: number, term: number) {
  const cfg = await getLoanSettings();
  validateLoanChoice(cfg, principalCents, term);
  const db = adminClient();
  const snapshot = buildSchedule({ principalCents, monthlyRate: cfg.monthly_rate, termMonths: term });
  const { data: lender } = await db.from("lenders").select("id").eq("active", true).limit(1).single();
  const expiresHours = (await getSetting<{ expires_hours: number }>("proposal", { expires_hours: 72 })).expires_hours;
  const { data: p, error } = await db.from("proposals").insert({
    customer_id: customerId, agent_id: agentId, lender_id: lender!.id, product_version_id: null,
    principal_cents: principalCents, term_months: term, monthly_rate: cfg.monthly_rate,
    schedule_snapshot: { ...snapshot, product: { id: null, name: "Crédito padrão (prestações)", version: "loan-settings" } },
    status: "sent", sent_at: new Date().toISOString(), expires_at: new Date(Date.now() + expiresHours * 3600_000).toISOString(),
  }).select("id, number").single();
  if (error) throw new Error(error.message);
  await rpc("wc_audit", { p_action: "proposal.send", p_entity: "proposals", p_entity_id: p.id, p_meta: { agent: agentId, flexible: true } }).catch(() => {});
  return { proposalId: p.id as string, number: p.number as number };
}
