import { adminClient } from "@/lib/supabase/admin";
import { PageTitle, StatusBadge, Money, Empty } from "@/components/ui";
import { maskCPF, maskPhone } from "@/lib/utils/mask";
import { formatDateTimeBR } from "@/lib/finance/dates";
import { ActionButton } from "@/components/action-button";
import { assignLead, discardLead } from "../actions";
import { AssignSelect } from "./assign-select";

const LABEL: Record<string, string> = { new: "Novo", assigned: "Atribuído", converted: "Virou cliente", discarded: "Descartado" };

export default async function AdminLeads() {
  const db = adminClient();
  const [{ data: leads }, { data: agents }] = await Promise.all([
    db.from("leads").select("*, agent:profiles!leads_assigned_to_fkey(full_name)").order("created_at", { ascending: false }).limit(200),
    db.from("profiles").select("id, full_name, referral_slug").eq("role", "agent").eq("active", true).order("full_name"),
  ]);
  const open = (leads ?? []).filter((l) => l.status === "new");
  const rest = (leads ?? []).filter((l) => l.status !== "new");
  return (
    <>
      <PageTitle title="Leads da landing" subtitle="Pedidos de crédito vindos do site. Atribuir cria o cliente na carteira do agente e envia o convite." />
      <h2 className="font-semibold text-navy mb-2">Sem agente ({open.length})</h2>
      {!open.length ? <Empty>Nenhum lead aguardando.</Empty> : (
        <div className="card overflow-x-auto mb-8"><table className="table"><thead><tr><th>Quando</th><th>Nome</th><th>CPF</th><th>Celular</th><th>Pedido</th><th>Origem</th><th>Atribuir</th><th></th></tr></thead>
          <tbody>{open.map((l) => (
            <tr key={l.id}><td className="text-xs text-muted">{formatDateTimeBR(l.created_at)}</td><td className="font-semibold">{l.full_name}{l.email && <div className="text-xs text-muted">{l.email}</div>}</td><td className="font-mono text-xs">{maskCPF(l.cpf)}</td><td className="text-xs">{maskPhone(l.phone)}</td><td>{l.amount_cents ? <><Money cents={l.amount_cents} /> em {l.term_months}x</> : "—"}</td><td className="text-xs">{l.source_slug ?? "site"}</td>
              <td><AssignSelect leadId={l.id} agents={agents ?? []} act={assignLead} /></td>
              <td><ActionButton label="Descartar" className="btn-danger !py-1 !px-2 text-xs" prompt="Motivo:" action={discardLead} args={[l.id]} /></td></tr>
          ))}</tbody></table></div>
      )}
      <h2 className="font-semibold text-navy mb-2">Histórico</h2>
      {!rest.length ? <Empty>—</Empty> : (
        <div className="card overflow-x-auto"><table className="table"><thead><tr><th>Quando</th><th>Nome</th><th>Pedido</th><th>Origem</th><th>Agente</th><th>Status</th></tr></thead>
          <tbody>{rest.map((l) => <tr key={l.id}><td className="text-xs text-muted">{formatDateTimeBR(l.created_at)}</td><td>{l.full_name}</td><td>{l.amount_cents ? <><Money cents={l.amount_cents} /> em {l.term_months}x</> : "—"}</td><td className="text-xs">{l.source_slug ?? "site"}</td><td>{(l.agent as unknown as { full_name: string } | null)?.full_name ?? "—"}</td><td><StatusBadge status={l.status} overrideLabel={LABEL[l.status]} />{l.note && <div className="text-xs text-muted">{l.note}</div>}</td></tr>)}</tbody></table></div>
      )}
      <div className="card p-4 mt-8 text-sm">
        <h2 className="font-semibold text-navy mb-2">Links de indicação dos agentes</h2>
        <ul className="grid sm:grid-cols-2 gap-2">{(agents ?? []).map((a) => <li key={a.id} className="flex items-center justify-between gap-2 border border-line rounded-lg px-3 py-2"><span>{a.full_name}</span><code className="text-xs text-navy">{process.env.NEXT_PUBLIC_APP_URL}/a/{a.referral_slug}</code></li>)}</ul>
      </div>
    </>
  );
}
