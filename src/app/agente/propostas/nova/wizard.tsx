"use client";
import { useActionState, useMemo, useState } from "react";
import { sendProposalAction } from "../../actions";
import { Alert, Field } from "@/components/ui";
import { ScheduleTable } from "@/components/schedule-table";
import type { ScheduleSnapshot } from "@/lib/finance/price";
import { formatBRL, formatRate } from "@/lib/finance/money";
import { maskCPF } from "@/lib/utils/mask";

interface Props {
  customers: { id: string; name: string; cpf: string; hasAccess: boolean; pixStatus: string }[];
  products: { id: string; name: string; principal: number; rate: string; terms: number[]; fee: number; version: number }[];
  sims: { pvId: string; term: number; snap: ScheduleSnapshot }[];
  preselected: string;
}

export function ProposalWizard({ customers, products, sims, preselected }: Props) {
  const [customer, setCustomer] = useState(preselected || customers[0]?.id || "");
  const [pv, setPv] = useState(products[0]?.id || "");
  const product = products.find((p) => p.id === pv);
  const [term, setTerm] = useState(product?.terms[0] ?? 0);
  const snap = useMemo(() => sims.find((s) => s.pvId === pv && s.term === term)?.snap, [sims, pv, term]);
  const [state, action, pending] = useActionState(sendProposalAction, undefined);
  const cust = customers.find((c) => c.id === customer);

  return (
    <form action={action} className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <div className="card p-4 space-y-3 h-fit">
        <Field label="Cliente">
          <select className="input" name="customer_id" value={customer} onChange={(e) => setCustomer(e.target.value)}>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name} · {maskCPF(c.cpf)}</option>)}
          </select>
        </Field>
        {cust && !cust.hasAccess && <Alert kind="warn">Este cliente ainda não criou o acesso ao portal; ele precisará dele para aceitar.</Alert>}
        <Field label="Produto">
          <div className="grid grid-cols-2 gap-2">
            {products.map((p) => (
              <button type="button" key={p.id} onClick={() => { setPv(p.id); setTerm(p.terms[0]); }}
                className={`rounded-lg border px-3 py-2 text-sm font-semibold ${pv === p.id ? "border-green bg-green-soft text-green" : "border-line bg-surface text-ink"}`}>
                {formatBRL(p.principal)}
              </button>
            ))}
          </div>
          <input type="hidden" name="product_version_id" value={pv} />
        </Field>
        <Field label="Prazo (meses)">
          <div className="flex flex-wrap gap-2">
            {product?.terms.map((t) => (
              <button type="button" key={t} onClick={() => setTerm(t)} className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${term === t ? "border-navy bg-navy text-white" : "border-line"}`}>{t}x</button>
            ))}
          </div>
          <input type="hidden" name="term_months" value={term} />
        </Field>
        {product && <p className="text-xs text-muted">Taxa {formatRate(product.rate, " a.m.")} · versão {product.version} do catálogo{product.fee ? ` · tarifa ${formatBRL(product.fee)}` : ""}</p>}
        {state?.error && <Alert kind="danger">{state.error}</Alert>}
        <button className="btn-green w-full" disabled={pending || !snap}>{pending ? "Enviando…" : "Enviar para aceite do cliente"}</button>
      </div>
      <div className="card p-4">
        {snap ? <ScheduleTable snap={snap} /> : <p className="text-sm text-muted">Selecione produto e prazo.</p>}
      </div>
    </form>
  );
}
