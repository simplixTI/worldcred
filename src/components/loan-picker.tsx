"use client";
import { useMemo } from "react";
import { motion, useReducedMotion } from "motion/react";
import { buildSchedule } from "@/lib/finance/price";
import { formatBRL, formatRate } from "@/lib/finance/money";
import { CountUp } from "./motion";

export interface PickerLimits { min_cents: number; max_cents: number; step_cents: number; min_term: number; max_term: number; }

/** Cotação no cliente (mesmo motor do servidor) para feedback imediato. */
export function useLoanQuote(principal: number, term: number, rate: string) {
  return useMemo(() => buildSchedule({ principalCents: principal, monthlyRate: rate, termMonths: term }), [principal, term, rate]);
}

function Range({ value, min, max, step, onChange, label, format, dark }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; label: string; format: (v: number) => string; dark?: boolean }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className="block">
      <span className={`flex items-baseline justify-between mb-2 ${dark ? "text-white/70" : "text-muted"}`}>
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em]">{label}</span>
        <span className={`text-lg font-extrabold tabular-nums ${dark ? "text-white" : "text-navy"}`}>{format(value)}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label}
        className="wc-range w-full" style={{ "--pct": `${pct}%` } as React.CSSProperties} />
      <span className={`flex justify-between text-[11px] mt-1 ${dark ? "text-white/45" : "text-muted"}`}><span>{format(min)}</span><span>{format(max)}</span></span>
    </label>
  );
}

/**
 * Seletor de crédito: valor livre + prazo em barra. Mostra a parcela em tempo real.
 * `variant="hero"` para o fundo escuro da landing; `"card"` para páginas internas.
 */
export function LoanPicker({ limits, rate, principal, term, onPrincipal, onTerm, variant = "card", children }: {
  limits: PickerLimits; rate: string; principal: number; term: number; onPrincipal: (v: number) => void; onTerm: (v: number) => void; variant?: "hero" | "card"; children?: React.ReactNode;
}) {
  const q = useLoanQuote(principal, term, rate);
  const reduce = useReducedMotion();
  const dark = variant === "hero";
  return (
    <div className={dark ? "text-white" : ""}>
      <div className="space-y-5">
        <Range label="Quanto você precisa" value={principal} min={limits.min_cents} max={limits.max_cents} step={limits.step_cents} onChange={onPrincipal} format={(v) => formatBRL(v).replace(",00", "")} dark={dark} />
        <Range label="Em quantas vezes" value={term} min={limits.min_term} max={limits.max_term} step={1} onChange={onTerm} format={(v) => `${v}x`} dark={dark} />
      </div>
      <div className={`mt-5 rounded-2xl p-5 relative overflow-hidden ${dark ? "bg-white/8 ring-1 ring-white/15" : "bg-navy text-white"}`}>
        <motion.div aria-hidden className="absolute -right-10 -bottom-16 w-48 h-48 rounded-full bg-green-bright/25 blur-2xl" animate={reduce ? undefined : { scale: [1, 1.15, 1] }} transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }} />
        <div className="relative flex items-end justify-between gap-4 flex-wrap">
          <div>
            <div className="text-xs uppercase tracking-[0.12em] text-white/60">{term} parcelas de</div>
            <div className="text-4xl md:text-5xl font-extrabold tabular-nums leading-none mt-1 text-white"><CountUp value={q.regular_installment_cents} kind="brl" duration={0.45} /></div>
          </div>
          <dl className="text-xs text-white/75 space-y-0.5 text-right">
            <div><dt className="inline">Total: </dt><dd className="inline font-bold text-white tabular-nums">{formatBRL(q.total_cents)}</dd></div>
            <div><dt className="inline">Juros: </dt><dd className="inline tabular-nums">{formatRate(rate)} a.m.</dd></div>
            <div><dt className="inline">CET: </dt><dd className="inline tabular-nums">{formatRate(q.cet_monthly)} a.m.</dd></div>
          </dl>
        </div>
        {q.last_installment_adjustment_cents !== 0 && <div className="relative text-[11px] text-white/55 mt-2">última parcela de {formatBRL(q.last_installment_cents)}</div>}
      </div>
      {children}
    </div>
  );
}
