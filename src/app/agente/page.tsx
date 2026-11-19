import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageTitle, StatusBadge, Money, Empty, Kpi } from "@/components/ui";
import { Stagger, Item } from "@/components/motion";
import { ReferralCard } from "./referral-card";
import { env } from "@/lib/env";
import { formatDateBR } from "@/lib/finance/dates";

type Ref = { customer_id: string; full_name: string; cpf_masked: string; created_at: string; proposal_status: string | null; contract_status: string | null; principal_cents: number | null; term_months: number | null; next_due: string | null; overdue_days: number | null };

export default async function AgentHome() {
  const s = await requireRole(["agent"], { mfa: false });
  const db = await createClient();
  const [{ data: me }, { data: refs }] = await Promise.all([
    db.from("profiles").select("referral_code, referral_slug").eq("id", s.userId).maybeSingle(),
    db.rpc("wc_agent_referrals", { p_agent: s.userId }),
  ]);
  const list = (refs ?? []) as Ref[];
  const active = list.filter((r) => r.contract_status === "active");
  const pending = list.filter((r) => !r.contract_status && r.proposal_status && !["declined", "expired", "cancelled"].includes(r.proposal_status));
  const late = list.filter((r) => (r.overdue_days ?? 0) > 0);
  return (
    <>
      <PageTitle title={`Olá, ${s.fullName.split(" ")[0]}`} subtitle="Você indica, o cliente se cadastra no site com o seu ID, e a WorldCred cuida do resto." />
      {me?.referral_code && <ReferralCard code={me.referral_code} url={`${env.appUrl}/cadastro?ref=${me.referral_code}`} />}
      <Stagger className="grid gap-3 grid-cols-2 sm:grid-cols-4 mt-6" delay={0.1}>
        <Item><Kpi label="Indicados" value={list.length} /></Item>
        <Item><Kpi label="Em andamento" value={pending.length} hint="aguardando aceite ou aprovação" /></Item>
        <Item><Kpi label="Contratos ativos" cents={active.reduce((a, r) => a + Number(r.principal_cents ?? 0), 0)} hint={`${active.length} contrato(s)`} /></Item>
        <Item><Kpi label="Em atraso" value={late.length} hint={late.length ? "a WorldCred está cobrando" : "nenhum"} /></Item>
      </Stagger>
      <h2 className="font-bold text-navy text-lg mt-8 mb-2">Minhas indicações</h2>
      {!list.length ? <Empty>Ninguém se cadastrou com o seu ID ainda. Compartilhe o link acima.</Empty> : (
        <div className="card overflow-x-auto"><table className="table"><thead><tr><th>Cliente</th><th>Cadastro</th><th>Crédito</th><th>Situação</th><th>Próxima parcela</th></tr></thead>
          <tbody>{list.map((r) => (
            <tr key={r.customer_id}><td className="font-semibold">{r.full_name}<div className="text-xs text-muted font-mono">{r.cpf_masked}</div></td><td className="text-xs text-muted">{formatDateBR(r.created_at)}</td>
              <td>{r.principal_cents ? <><Money cents={r.principal_cents} /> <span className="text-muted">em {r.term_months}x</span></> : "—"}</td>
              <td>{r.contract_status ? <StatusBadge status={r.contract_status} /> : r.proposal_status ? <StatusBadge status={r.proposal_status} /> : <span className="text-muted text-xs">sem proposta</span>}</td>
              <td>{r.next_due ? <>{formatDateBR(r.next_due)}{(r.overdue_days ?? 0) > 0 && <span className="ml-2 badge bg-danger-soft text-danger">{r.overdue_days} dias</span>}</> : "—"}</td></tr>
          ))}</tbody></table></div>
      )}
    </>
  );
}
