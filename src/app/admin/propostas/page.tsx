import { adminClient } from "@/lib/supabase/admin";
import { PageTitle, StatusBadge, Money, Empty } from "@/components/ui";
import { formatDateTimeBR } from "@/lib/finance/dates";
import { maskCPF } from "@/lib/utils/mask";
import { ActionButton } from "@/components/action-button";
import { approveProposal, declineProposal } from "../actions";
import type { ScheduleSnapshot } from "@/lib/finance/price";

export default async function AdminPropostas() {
  const db = adminClient();
  const { data } = await db.from("proposals").select("*, customers(full_name, cpf, pix_key_status), profiles!proposals_agent_id_fkey(full_name)").in("status", ["accepted", "sent", "declined", "contracted"]).order("accepted_at", { ascending: false, nullsFirst: false }).limit(100);
  const waiting = (data ?? []).filter((p) => p.status === "accepted");
  const others = (data ?? []).filter((p) => p.status !== "accepted");
  return (
    <>
      <PageTitle title="Aprovação de crédito" subtitle="Propostas aceitas pelo cliente aguardando decisão do perfil autorizado." />
      {!waiting.length ? <Empty>Nenhuma proposta aguardando aprovação.</Empty> : (
        <div className="card overflow-x-auto mb-6"><table className="table"><thead><tr><th>Nº</th><th>Cliente</th><th>Agente</th><th>Operação</th><th>Chave Pix</th><th>Aceite</th><th></th></tr></thead>
          <tbody>{waiting.map((p) => { const s = p.schedule_snapshot as ScheduleSnapshot; const c = p.customers as unknown as { full_name: string; cpf: string; pix_key_status: string }; return (
            <tr key={p.id}><td>#{p.number}</td><td>{c.full_name}<div className="text-xs text-muted">{maskCPF(c.cpf)}</div></td><td>{(p.profiles as unknown as { full_name: string })?.full_name}</td>
              <td><Money cents={p.principal_cents} /> · {p.term_months}x de <Money cents={s.regular_installment_cents} /><div className="text-xs text-muted">CET {(Number(s.cet_monthly) * 100).toFixed(2)}% a.m. · líquido <Money cents={s.net_cents} /></div></td>
              <td><StatusBadge status={c.pix_key_status} /></td><td className="text-muted text-xs">{formatDateTimeBR(p.accepted_at)}<div>IP {(p.acceptance_evidence as { ip?: string })?.ip ?? "—"}</div></td>
              <td><div className="flex gap-1"><ActionButton label="Aprovar" className="btn-green !py-1.5 !px-3 text-xs" action={approveProposal} args={[p.id]} prompt="Observação (opcional):" /><ActionButton label="Recusar" className="btn-danger !py-1.5 !px-3 text-xs" action={declineProposal} args={[p.id]} prompt="Motivo da recusa:" /></div></td></tr>
          ); })}</tbody></table></div>
      )}
      <h2 className="font-semibold text-navy mb-2">Histórico recente</h2>
      <div className="card overflow-x-auto"><table className="table"><thead><tr><th>Nº</th><th>Cliente</th><th>Valor</th><th>Status</th><th>Decisão</th></tr></thead>
        <tbody>{others.map((p) => <tr key={p.id}><td>#{p.number}</td><td>{(p.customers as unknown as { full_name: string }).full_name}</td><td><Money cents={p.principal_cents} /></td><td><StatusBadge status={p.status} /></td><td className="text-xs text-muted">{p.decided_at ? formatDateTimeBR(p.decided_at) : "—"} {p.decision_note}</td></tr>)}</tbody></table></div>
    </>
  );
}
