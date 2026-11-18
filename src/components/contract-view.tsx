import Link from "next/link";
import { PageTitle, StatusBadge, Money } from "@/components/ui";
import { ScheduleTable } from "@/components/schedule-table";
import { daysOverdue, formatDateBR, formatDateTimeBR } from "@/lib/finance/dates";
import { maskCPF, maskPixKey } from "@/lib/utils/mask";
import type { ScheduleSnapshot } from "@/lib/finance/price";

type Inst = { id: string; number: number; due_date: string; amount_cents: number; paid_cents: number; status: string; in_review: boolean; paid_at: string | null };
type Disb = { id: string; reference: string; status: string; amount_cents: number; pix_key: string; confirmed_at: string | null; last_error: string | null; attempts: number };

export function ContractView({ contract: c, basePath, payLinks = false }: { contract: Record<string, unknown>; basePath: string; payLinks?: boolean }) {
  const conditions = c.conditions as { schedule: ScheduleSnapshot; lender: { legal_name: string; cnpj: string }; acceptance?: Record<string, unknown> };
  const installments = ([...(c.installments as Inst[])]).sort((a, b) => a.number - b.number);
  const disbursements = (c.disbursements as Disb[]) ?? [];
  const customer = c.customers as { full_name: string; cpf: string };
  return (
    <>
      <PageTitle title={`Contrato ${c.number as string}`} subtitle={`${customer.full_name} · CPF ${maskCPF(customer.cpf)}`} action={<StatusBadge status={c.status as string} />} />
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <div className="card p-4">
            <h2 className="font-semibold text-navy mb-2">Parcelas</h2>
            {!installments.length ? <p className="text-sm text-muted">As parcelas são geradas na confirmação do desembolso.</p> : (
              <div className="overflow-x-auto"><table className="table"><thead><tr><th>Nº</th><th>Vencimento</th><th className="text-right">Valor</th><th className="text-right">Saldo</th><th>Status</th>{payLinks && <th></th>}</tr></thead>
                <tbody>{installments.map((i) => {
                  const d = daysOverdue(i.due_date); const open = i.status !== "paid" && i.status !== "cancelled";
                  return (
                    <tr key={i.id}><td>{i.number}</td><td>{formatDateBR(i.due_date)}{open && d > 0 && <span className="ml-2 badge bg-danger-soft text-danger">{d} dias</span>}</td><td className="text-right"><Money cents={i.amount_cents} /></td><td className="text-right"><Money cents={i.amount_cents - i.paid_cents} /></td>
                      <td><StatusBadge status={i.status} />{i.in_review && <span className="ml-1 badge bg-warn-soft text-warn">em conferência</span>}</td>
                      {payLinks && <td className="text-right">{open ? <Link href={`${basePath}/parcelas/${i.id}`} className="btn-green !py-1.5 !px-3">Pagar com Pix</Link> : <Link href={`${basePath}/parcelas/${i.id}`} className="text-navy underline text-xs">Recibo</Link>}</td>}
                    </tr>
                  );
                })}</tbody></table></div>
            )}
          </div>
          <div className="card p-4">
            <h2 className="font-semibold text-navy mb-2">Condições contratadas (congeladas no aceite)</h2>
            <ScheduleTable snap={conditions.schedule} compact />
          </div>
        </div>
        <div className="space-y-4">
          <div className="card p-4 text-sm space-y-1">
            <div className="font-semibold text-navy">Credor</div>
            <div>{conditions.lender.legal_name}</div>
            <div className="text-muted">CNPJ {conditions.lender.cnpj}</div>
            <div className="pt-2 text-muted text-xs">Versão das condições: {conditions.schedule.conditions_version} · aceite em {formatDateTimeBR(c.accepted_at as string)}</div>
            {conditions.acceptance && <div className="text-xs text-muted">Evidência de aceite: IP {String((conditions.acceptance as { ip?: string }).ip ?? "—")}, hash {String((conditions.acceptance as { text_hash?: string }).text_hash ?? "—").slice(0, 12)}…</div>}
          </div>
          <div className="card p-4 text-sm space-y-2">
            <div className="font-semibold text-navy">Desembolso</div>
            {!disbursements.length ? <p className="text-muted">—</p> : disbursements.map((d) => (
              <div key={d.id} className="border-t border-line pt-2 first:border-0 first:pt-0">
                <div className="flex items-center justify-between"><Money cents={d.amount_cents} className="font-semibold" /><StatusBadge status={d.status} /></div>
                <div className="text-xs text-muted font-mono">ref {d.reference}</div>
                <div className="text-xs text-muted">chave {maskPixKey(d.pix_key)} · {d.confirmed_at ? `confirmado ${formatDateTimeBR(d.confirmed_at)}` : `${d.attempts} tentativa(s)`}</div>
                {d.last_error && <div className="text-xs text-danger">{d.last_error}</div>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
