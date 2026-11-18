import { adminClient } from "@/lib/supabase/admin";
import { PageTitle, StatusBadge, Money, Empty, CASE_REASON } from "@/components/ui";
import { daysOverdue, formatDateTimeBR } from "@/lib/finance/dates";
import { ActionButton } from "@/components/action-button";
import { caseAction, reviewClaim, runCollections } from "../actions";
import { CaseActions } from "./case-actions";

export default async function AdminCobranca({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  const sp = await searchParams;
  const db = adminClient();
  const [{ data: cases }, { data: agents }, { data: queue }, { data: claims }] = await Promise.all([
    db.from("collection_cases").select("*, customers(full_name), installments(id, number, due_date, amount_cents, paid_cents, in_review), contracts(number, agent_id, profiles!contracts_agent_id_fkey(full_name)), assignee:profiles!collection_cases_assigned_to_fkey(full_name)").neq("status", "resolved").order("created_at"),
    db.from("profiles").select("id, full_name").in("role", ["agent", "admin"]).eq("active", true).order("full_name"),
    db.from("message_queue").select("*, customers(full_name), installments(number)").order("scheduled_for", { ascending: false }).limit(60),
    db.from("payment_claims").select("*, customers(full_name), installments(number, amount_cents)").eq("status", "open").order("created_at"),
  ]);
  const groups: Record<string, string> = { naopagou: "Cliente não pagou", mensagem: "Mensagem falhou", conferencia: "Pagamento em conferência", outros: "Outros" };
  const groupOf = (r: string) => r === "overdue" ? "naopagou" : r === "message_failed" ? "mensagem" : (r === "payment_review" || r === "reconciliation") ? "conferencia" : "outros";
  const shown = (cases ?? []).filter((c) => !sp.tipo || groupOf(c.reason) === sp.tipo);
  // última tentativa de mensagem por parcela
  const lastMsg = new Map<string, { status: string; sent_at: string | null; last_error: string | null; stage: string }>();
  for (const m of queue ?? []) if (!lastMsg.has(m.installment_id)) lastMsg.set(m.installment_id, m);
  return (
    <>
      <PageTitle title="Fila de cobrança" subtitle="Régua D0 / D+3 / D+7 por SMS; caso aberto em D+10. Separação por motivo." action={<ActionButton label="Executar régua agora" action={runCollections} args={[]} />} />
      <div className="flex gap-2 mb-4 flex-wrap text-sm">
        <a href="/admin/cobranca" className={`badge ${!sp.tipo ? "bg-navy text-white" : "bg-surface border border-line"}`}>Todos ({cases?.length ?? 0})</a>
        {Object.entries(groups).map(([k, v]) => <a key={k} href={`/admin/cobranca?tipo=${k}`} className={`badge ${sp.tipo === k ? "bg-navy text-white" : "bg-surface border border-line"}`}>{v} ({(cases ?? []).filter((c) => groupOf(c.reason) === k).length})</a>)}
      </div>
      {!shown.length ? <Empty>Nenhum caso em aberto.</Empty> : (
        <div className="card overflow-x-auto mb-6"><table className="table"><thead><tr><th>Cliente</th><th>Parcela</th><th>Saldo</th><th>Atraso</th><th>Agente originador</th><th>Responsável</th><th>Última tentativa</th><th>Motivo da escalada</th><th>Status</th><th></th></tr></thead>
          <tbody>{shown.map((k) => { const i = k.installments as unknown as { id: string; number: number; due_date: string; amount_cents: number; paid_cents: number; in_review: boolean } | null; const ct = k.contracts as unknown as { number: string; profiles: { full_name: string } } | null; const lm = i ? lastMsg.get(i.id) : undefined; return (
            <tr key={k.id}><td>{(k.customers as unknown as { full_name: string }).full_name}<div className="text-xs text-muted">{ct?.number}</div></td><td>{i ? `${i.number}ª` : "—"}</td><td>{i ? <Money cents={i.amount_cents - i.paid_cents} /> : "—"}</td><td>{i && daysOverdue(i.due_date) > 0 ? `${daysOverdue(i.due_date)} dias` : "—"}</td><td>{ct?.profiles?.full_name ?? "—"}</td><td>{(k.assignee as unknown as { full_name: string } | null)?.full_name ?? <span className="text-muted">—</span>}</td>
              <td className="text-xs">{lm ? <><StatusBadge status={lm.status} /> <span className="text-muted">{lm.stage} · {lm.sent_at ? formatDateTimeBR(lm.sent_at) : "—"}</span>{lm.last_error && <div className="text-danger">{lm.last_error}</div>}</> : <span className="text-muted">nenhuma</span>}</td>
              <td><span className="font-semibold">{CASE_REASON[k.reason]}</span><div className="text-xs text-muted">{k.detail}</div>{k.pause_reason && <div className="text-xs text-warn">Pausa: {k.pause_reason} até {formatDateTimeBR(k.paused_until)}</div>}</td><td><StatusBadge status={k.status} /></td>
              <td><CaseActions id={k.id} status={k.status} agents={agents ?? []} act={caseAction} /></td></tr>
          ); })}</tbody></table></div>
      )}
      {!!claims?.length && (
        <>
          <h2 className="font-semibold text-navy mb-2">Solicitações “Já paguei” aguardando conferência</h2>
          <div className="card overflow-x-auto mb-6"><table className="table"><thead><tr><th>Cliente</th><th>Parcela</th><th>Valor</th><th>Observação</th><th>Quando</th><th></th></tr></thead>
            <tbody>{claims.map((c) => <tr key={c.id}><td>{(c.customers as unknown as { full_name: string }).full_name}</td><td>{(c.installments as unknown as { number: number }).number}ª</td><td><Money cents={(c.installments as unknown as { amount_cents: number }).amount_cents} /></td><td className="text-xs">{c.note || "—"}</td><td className="text-xs text-muted">{formatDateTimeBR(c.created_at)}</td><td className="flex gap-1"><ActionButton label="Pagamento não localizado" className="btn-danger !py-1.5 !px-3 text-xs" action={reviewClaim} args={[c.id, false]} prompt="Observação para o cliente:" /></td></tr>)}</tbody></table></div>
          <p className="text-xs text-muted -mt-4 mb-6">A confirmação financeira só ocorre via webhook do provedor ou por conciliação auditada; esta tela apenas encerra a pausa quando nada é localizado.</p>
        </>
      )}
      <h2 className="font-semibold text-navy mb-2">Fila de mensagens (últimas 60)</h2>
      <div className="card overflow-x-auto"><table className="table"><thead><tr><th>Cliente</th><th>Parcela</th><th>Etapa</th><th>Canal</th><th>Agendada</th><th>Tentativas</th><th>Status</th><th>Detalhe</th></tr></thead>
        <tbody>{(queue ?? []).map((m) => <tr key={m.id}><td>{(m.customers as unknown as { full_name: string }).full_name}</td><td>{(m.installments as unknown as { number: number })?.number}ª</td><td>{m.stage}</td><td>{m.channel}</td><td className="text-xs">{formatDateTimeBR(m.scheduled_for)}</td><td>{m.attempts}/{m.max_attempts}</td><td><StatusBadge status={m.status} /></td><td className="text-xs text-muted">{m.last_error || m.skip_reason || (m.provider_message_id ? `id ${m.provider_message_id}` : "")}</td></tr>)}</tbody></table></div>
    </>
  );
}
