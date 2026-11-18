import type { ScheduleSnapshot } from "@/lib/finance/price";
import { formatBRL, formatRate } from "@/lib/finance/money";
import { formatDateBR } from "@/lib/finance/dates";

export function ScheduleTable({ snap, dueDates, compact = false }: { snap: ScheduleSnapshot; dueDates?: string[]; compact?: boolean }) {
  const items: [string, string][] = [
    ["Valor líquido a receber", formatBRL(snap.net_cents)],
    ["Valor do crédito", formatBRL(snap.principal_cents)],
    ["Parcelas", `${snap.term_months}x de ${formatBRL(snap.regular_installment_cents)}`],
    ["Total a pagar", formatBRL(snap.total_cents)],
    ["Taxa de juros", `${formatRate(snap.monthly_rate, " a.m.")} · ${formatRate(snap.annual_rate, " a.a.")}`],
    ["CET", `${formatRate(snap.cet_monthly, " a.m.")} · ${formatRate(snap.cet_annual, " a.a.")}`],
    ["Tarifas", snap.fee_cents ? formatBRL(snap.fee_cents) : "Não há"],
    ["Tributos (IOF)", snap.iof_cents ? formatBRL(snap.iof_cents) : "Não aplicável nesta operação"],
  ];
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {items.map(([k, v]) => (
          <div key={k} className="contents"><dt className="text-muted">{k}</dt><dd className="font-semibold text-right text-navy">{v}</dd></div>
        ))}
      </dl>
      {snap.last_installment_adjustment_cents !== 0 && (
        <p className="text-xs text-muted">Sistema Price com arredondamento para centavos. A última parcela é ajustada em {formatBRL(Math.abs(snap.last_installment_adjustment_cents))} ({snap.last_installment_adjustment_cents > 0 ? "a mais" : "a menos"}) para fechar exatamente o saldo devedor: {formatBRL(snap.last_installment_cents)}.</p>
      )}
      {!compact && (
        <div className="overflow-x-auto">
          <table className="table"><thead><tr><th>Nº</th>{dueDates && <th>Vencimento</th>}<th className="text-right">Parcela</th><th className="text-right">Juros</th><th className="text-right">Amortização</th><th className="text-right">Saldo</th></tr></thead>
            <tbody>{snap.installments.map((x, i) => (
              <tr key={x.number}><td>{x.number}</td>{dueDates && <td>{formatDateBR(dueDates[i])}</td>}<td className="text-right tabular-nums">{formatBRL(x.amount_cents)}</td><td className="text-right tabular-nums text-muted">{formatBRL(x.interest_cents)}</td><td className="text-right tabular-nums text-muted">{formatBRL(x.principal_cents)}</td><td className="text-right tabular-nums text-muted">{formatBRL(x.balance_after_cents)}</td></tr>
            ))}</tbody></table>
        </div>
      )}
      {!dueDates && <p className="text-xs text-muted">As datas de vencimento são definidas na confirmação do desembolso: 1ª parcela 30 dias depois e as demais mensalmente (fuso de Brasília).</p>}
    </div>
  );
}
