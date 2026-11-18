"use client";
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { formatBRL, formatRate } from "@/lib/finance/money";
import { CountUp } from "@/components/motion";

export interface SimProduct { principal: number; terms: number[]; rate: string; }
export interface SimRow { principal: number; term: number; installment: number; last: number; total: number; net: number; cet_monthly: string; cet_annual: string; annual: string; }

export const SELECTION_EVENT = "wc:selection";

export function Simulator({ products, sims }: { products: SimProduct[]; sims: SimRow[] }) {
  const [principal, setPrincipal] = useState(products[1]?.principal ?? products[0]?.principal ?? 0);
  const product = products.find((p) => p.principal === principal) ?? products[0];
  const [term, setTerm] = useState(product?.terms.includes(10) ? 10 : product?.terms[0] ?? 0);
  const row = useMemo(() => sims.find((s) => s.principal === principal && s.term === term), [sims, principal, term]);
  const reduce = useReducedMotion();

  useEffect(() => {
    try { window.dispatchEvent(new CustomEvent(SELECTION_EVENT, { detail: { principal, term } })); } catch { /* noop */ }
  }, [principal, term]);

  return (
    <div className="card p-5 md:p-6 shadow-[0_30px_80px_-30px_rgba(6,16,46,0.55)] relative overflow-hidden">
      <div aria-hidden className="absolute -top-24 -right-24 w-64 h-64 rounded-full bg-green-soft blur-3xl opacity-70" />
      <div className="relative">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-navy">Simule agora</h2>
          <span className="badge bg-green-soft text-green">sem compromisso</span>
        </div>
        <span className="label">Quanto você precisa?</span>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-4" role="radiogroup" aria-label="Valor do crédito">
          {products.map((p) => (
            <button key={p.principal} type="button" role="radio" aria-checked={principal === p.principal}
              onClick={() => { setPrincipal(p.principal); if (!p.terms.includes(term)) setTerm(p.terms[0]); }}
              className={`relative rounded-xl border px-2 py-2.5 text-sm font-bold tabular-nums transition-colors ${principal === p.principal ? "border-green text-green" : "border-line text-ink hover:border-navy/40"}`}>
              {principal === p.principal && <motion.span layoutId="sim-amount" className="absolute inset-0 rounded-xl bg-green-soft" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
              <span className="relative">{formatBRL(p.principal).replace(",00", "")}</span>
            </button>
          ))}
        </div>
        <span className="label">Em quantas vezes?</span>
        <div className="flex flex-wrap gap-2 mb-5" role="radiogroup" aria-label="Prazo em meses">
          {product?.terms.map((t) => (
            <button key={t} type="button" role="radio" aria-checked={term === t} onClick={() => setTerm(t)}
              className={`relative rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${term === t ? "border-navy text-white" : "border-line text-ink hover:border-navy/40"}`}>
              {term === t && <motion.span layoutId="sim-term" className="absolute inset-0 rounded-xl bg-navy" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
              <span className="relative">{t}x</span>
            </button>
          ))}
        </div>
        {row && (
          <div className="rounded-2xl bg-navy text-white p-5 relative overflow-hidden">
            <div aria-hidden className="absolute -right-10 -bottom-16 w-48 h-48 rounded-full bg-green-bright/25 blur-2xl" />
            <div className="relative flex items-end justify-between gap-3 flex-wrap">
              <div>
                <div className="text-xs uppercase tracking-[0.12em] text-white/60">{row.term} parcelas de</div>
                <div className="text-4xl md:text-[44px] font-extrabold tabular-nums leading-none mt-1">
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span key={`${row.principal}-${row.term}`} initial={reduce ? false : { opacity: 0, y: 10, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -10, filter: "blur(6px)" }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }} className="inline-block">
                      <CountUp value={row.installment} kind="brl" duration={0.6} />
                    </motion.span>
                  </AnimatePresence>
                </div>
              </div>
              <div className="text-right text-sm">
                <div className="text-white/60 text-xs">você recebe via Pix</div>
                <div className="font-bold text-lg tabular-nums">{formatBRL(row.net)}</div>
              </div>
            </div>
            <dl className="relative grid grid-cols-2 gap-x-4 gap-y-1 mt-4 pt-4 border-t border-white/15 text-xs text-white/75">
              <dt>Total a pagar</dt><dd className="text-right tabular-nums text-white">{formatBRL(row.total)}</dd>
              <dt>Juros</dt><dd className="text-right tabular-nums text-white">{formatRate(product!.rate)} a.m. · {formatRate(row.annual)} a.a.</dd>
              <dt>CET</dt><dd className="text-right tabular-nums text-white">{formatRate(row.cet_monthly)} a.m. · {formatRate(row.cet_annual)} a.a.</dd>
              {row.last !== row.installment && <><dt>Última parcela</dt><dd className="text-right tabular-nums text-white">{formatBRL(row.last)}</dd></>}
            </dl>
          </div>
        )}
        <a href="#quero-credito" className="btn-green w-full mt-4 !py-3 text-base">Quero este crédito</a>
        <p className="text-[11px] text-muted mt-3 leading-relaxed">Simulação pela Tabela Price com parcelas fixas. Sem tarifas escondidas. Sujeito a análise de crédito. Credor: World Serviços de Crédito LTDA.</p>
      </div>
    </div>
  );
}
