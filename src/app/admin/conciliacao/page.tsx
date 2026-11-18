import { adminClient } from "@/lib/supabase/admin";
import { PageTitle, StatusBadge, Money, Empty } from "@/components/ui";
import { formatDateTimeBR } from "@/lib/finance/dates";
import { ActionButton } from "@/components/action-button";
import { resolveReconciliation, linkPayment } from "../actions";

const REASON: Record<string, string> = { partial_payment: "Pagamento parcial", overpayment: "Valor maior que o devido", duplicate_payment: "Pagamento duplicado", unlinked: "Sem vínculo com cobrança", receiver_mismatch: "Conta recebedora divergente", refund: "Estorno" };

export default async function AdminConciliacao() {
  const db = adminClient();
  const [{ data: open }, { data: resolved }] = await Promise.all([
    db.from("reconciliation_items").select("*, payments(*, installments(number, amount_cents, paid_cents, contracts(number, customers(full_name))))").eq("status", "open").order("created_at"),
    db.from("reconciliation_items").select("*, payments(amount_cents, external_payment_id), profiles(full_name)").eq("status", "resolved").order("resolved_at", { ascending: false }).limit(30),
  ]);
  return (
    <>
      <PageTitle title="Conciliação" subtitle="Pagamentos parciais, divergentes, duplicados, sem vínculo ou estornados. Toda resolução é auditada." />
      {!open?.length ? <Empty>Nada pendente de conciliação.</Empty> : (
        <div className="card overflow-x-auto mb-6"><table className="table"><thead><tr><th>Motivo</th><th>Pagamento</th><th>Parcela</th><th>Recebido em</th><th>Nota</th><th></th></tr></thead>
          <tbody>{open.map((it) => { const p = it.payments as unknown as { amount_cents: number; applied_cents: number; external_payment_id: string; reference: string; paid_at: string; installments: { number: number; amount_cents: number; paid_cents: number; contracts: { number: string; customers: { full_name: string } } } | null }; const i = p.installments; return (
            <tr key={it.id}><td className="font-semibold">{REASON[it.reason] ?? it.reason}</td><td><Money cents={p.amount_cents} /><div className="text-xs text-muted font-mono">{p.external_payment_id}<br />{p.reference}</div></td>
              <td>{i ? <>{i.contracts.customers.full_name}<div className="text-xs text-muted">{i.contracts.number} · {i.number}ª · saldo <Money cents={i.amount_cents - i.paid_cents} /></div></> : <span className="text-muted">—</span>}</td>
              <td className="text-xs">{formatDateTimeBR(p.paid_at)}</td><td className="text-xs text-muted">{it.note}</td>
              <td><div className="flex flex-col gap-1">
                {i && it.reason !== "refund" && <ActionButton label="Aplicar à parcela" className="btn-green !py-1.5 !px-3 text-xs" onRun={(n) => resolveReconciliation(it.id, "apply", n)} prompt="Justificativa (auditada):" />}
                {!i && <ActionButton label="Vincular a parcela (ID)" onRun={async (n) => { if (!n) return { error: "informe o ID" }; return linkPayment(it.id, n); }} prompt="ID da parcela (UUID):" />}
                <ActionButton label="Registrar ciência" onRun={(n) => resolveReconciliation(it.id, "acknowledge", n)} prompt="Observação:" />
                <ActionButton label="Rejeitar" className="btn-danger !py-1.5 !px-3 text-xs" onRun={(n) => resolveReconciliation(it.id, "reject", n)} prompt="Motivo:" />
              </div></td></tr>
          ); })}</tbody></table></div>
      )}
      <h2 className="font-semibold text-navy mb-2">Resolvidos recentemente</h2>
      {!resolved?.length ? <Empty>—</Empty> : (
        <div className="card overflow-x-auto"><table className="table"><thead><tr><th>Motivo</th><th>Valor</th><th>Resolução</th><th>Por</th><th>Quando</th><th>Nota</th></tr></thead>
          <tbody>{resolved.map((it) => <tr key={it.id}><td>{REASON[it.reason] ?? it.reason}</td><td><Money cents={(it.payments as unknown as { amount_cents: number }).amount_cents} /></td><td><StatusBadge status={it.resolution ?? ""} overrideLabel={it.resolution ?? ""} /></td><td>{(it.profiles as unknown as { full_name: string } | null)?.full_name}</td><td className="text-xs">{formatDateTimeBR(it.resolved_at)}</td><td className="text-xs text-muted">{it.note}</td></tr>)}</tbody></table></div>
      )}
    </>
  );
}
