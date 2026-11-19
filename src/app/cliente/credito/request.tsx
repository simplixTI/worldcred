"use client";
import { useActionState, useState } from "react";
import { motion } from "motion/react";
import { requestLoanAction } from "../actions";
import { Alert } from "@/components/ui";
import { CountUp } from "@/components/motion";
import { formatBRL, formatRate } from "@/lib/finance/money";

interface Product { id: string; principal: number; terms: number[]; rate: string; }
interface Sim { pvId: string; term: number; installment: number; total: number; net: number; cet: string; last: number; }

export function LoanRequest({ products, sims }: { products: Product[]; sims: Sim[] }) {
  const [pvId, setPvId] = useState(products[1]?.id ?? products[0]?.id ?? "");
  const product = products.find((p) => p.id === pvId) ?? products[0];
  const [term, setTerm] = useState(product?.terms.includes(10) ? 10 : product?.terms[0] ?? 0);
  const sim = sims.find((s) => s.pvId === pvId && s.term === term);
  const [state, action, pending] = useActionState(requestLoanAction, undefined);
  return (
    <form action={action} className="card p-6 space-y-5 max-w-3xl">
      <input type="hidden" name="product_version_id" value={pvId} /><input type="hidden" name="term_months" value={term} />
      <div><span className="label">Valor</span>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2" role="radiogroup">
          {products.map((p) => <button type="button" key={p.id} role="radio" aria-checked={pvId === p.id} onClick={() => { setPvId(p.id); if (!p.terms.includes(term)) setTerm(p.terms[0]); }} className={`relative rounded-xl border px-2 py-3 text-sm font-bold tabular-nums transition-colors ${pvId === p.id ? "border-green text-green" : "border-line hover:border-navy/40"}`}>{pvId === p.id && <motion.span layoutId="loan-amt" className="absolute inset-0 rounded-xl bg-green-soft" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}<span className="relative">{formatBRL(p.principal).replace(",00", "")}</span></button>)}
        </div></div>
      <div><span className="label">Prazo</span>
        <div className="flex flex-wrap gap-2" role="radiogroup">
          {product?.terms.map((t) => <button type="button" key={t} role="radio" aria-checked={term === t} onClick={() => setTerm(t)} className={`relative rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${term === t ? "border-navy text-white" : "border-line hover:border-navy/40"}`}>{term === t && <motion.span layoutId="loan-term" className="absolute inset-0 rounded-xl bg-navy" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}<span className="relative">{t}x</span></button>)}
        </div></div>
      {sim && (
        <div className="rounded-2xl bg-navy text-white p-5 grid sm:grid-cols-[1fr_auto] gap-4 items-end">
          <div><div className="text-xs uppercase tracking-[0.12em] text-white/60">{term} parcelas de</div><div className="text-4xl font-extrabold tabular-nums leading-none mt-1"><CountUp value={sim.installment} kind="brl" duration={0.5} /></div>{sim.last !== sim.installment && <div className="text-xs text-white/60 mt-1">última de {formatBRL(sim.last)}</div>}</div>
          <dl className="text-xs text-white/75 space-y-1 sm:text-right"><div><dt className="inline">Você recebe via Pix: </dt><dd className="inline font-bold text-white tabular-nums">{formatBRL(sim.net)}</dd></div><div><dt className="inline">Total: </dt><dd className="inline font-bold text-white tabular-nums">{formatBRL(sim.total)}</dd></div><div><dt className="inline">Juros {formatRate(product?.rate ?? "0")} a.m. · CET: </dt><dd className="inline font-bold text-white tabular-nums">{formatRate(sim.cet)} a.m.</dd></div></dl>
        </div>
      )}
      {state?.error && <Alert kind="danger">{state.error}</Alert>}
      <button className="btn-green w-full !py-3 text-base" disabled={pending || !sim}>{pending ? "Gerando proposta…" : "Gerar minha proposta"}</button>
      <p className="text-xs text-muted">A proposta fica disponível para leitura e aceite no portal. Após o aceite e a aprovação, o valor é enviado para a sua chave Pix.</p>
    </form>
  );
}
