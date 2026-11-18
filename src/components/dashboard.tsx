"use client";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { formatBRL } from "@/lib/finance/money";
import { CountUp } from "./motion";

const EASE = [0.16, 1, 0.3, 1] as const;

export interface Segment { key: string; label: string; cents: number; href: string; tone: "danger" | "green" | "navy" | "muted" | "soft"; }

const TONE: Record<Segment["tone"], string> = { danger: "bg-danger", green: "bg-green-bright", navy: "bg-navy", muted: "bg-navy/40", soft: "bg-navy/15" };
const DOT: Record<Segment["tone"], string> = { danger: "bg-danger", green: "bg-green-bright", navy: "bg-navy", muted: "bg-navy/40", soft: "bg-navy/15" };

/** Linha do tempo dos recebíveis: barra proporcional (vencido → 7 → 15 → 30 → depois), clicável por faixa. */
export function ReceivablesBar({ segments }: { segments: Segment[] }) {
  const total = Math.max(segments.reduce((a, s) => a + s.cents, 0), 1);
  const reduce = useReducedMotion();
  return (
    <div>
      <div className="flex h-4 w-full overflow-hidden rounded-full bg-bg ring-1 ring-line" role="img" aria-label="Distribuição dos recebíveis por faixa de vencimento">
        {segments.map((s, i) => (
          <motion.div key={s.key} className={`${TONE[s.tone]} h-full`} initial={reduce ? false : { width: 0 }} animate={{ width: `${(s.cents / total) * 100}%` }} transition={{ duration: 0.8, ease: EASE, delay: i * 0.06 }} title={`${s.label}: ${formatBRL(s.cents)}`} />
        ))}
      </div>
      <ul className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-2">
        {segments.map((s) => (
          <li key={s.key}>
            <Link href={s.href} className="group block rounded-xl px-3 py-2.5 -mx-1 transition-colors hover:bg-bg">
              <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted whitespace-nowrap"><span className={`w-2 h-2 rounded-full ${DOT[s.tone]}`} aria-hidden />{s.label}</span>
              <span className={`block text-lg font-extrabold tabular-nums mt-0.5 ${s.tone === "danger" && s.cents > 0 ? "text-danger" : "text-navy"}`}><CountUp value={s.cents} kind="brl" /></span>
              <span className="text-[11px] text-muted">{total > 1 ? Math.round((s.cents / total) * 100) : 0}% · ver lista <span className="inline-block transition-transform group-hover:translate-x-0.5">→</span></span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Dois números grandes lado a lado com a proporção entre eles. */
export function CashPair({ outCents, inCents, outHref, inHref }: { outCents: number; inCents: number; outHref: string; inHref: string }) {
  const total = Math.max(outCents + inCents, 1);
  const reduce = useReducedMotion();
  return (
    <div>
      <div className="grid grid-cols-2 gap-6">
        <Link href={outHref} className="group">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/60">Principal desembolsado</span>
          <span className="block text-3xl md:text-4xl font-extrabold tabular-nums text-white leading-none mt-2"><CountUp value={outCents} kind="brl" /></span>
          <span className="text-xs text-white/55 group-hover:text-white/80 transition-colors">saiu via Pix no período →</span>
        </Link>
        <Link href={inHref} className="group text-right">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-green-soft/80">Recebido</span>
          <span className="block text-3xl md:text-4xl font-extrabold tabular-nums text-green-bright leading-none mt-2"><CountUp value={inCents} kind="brl" /></span>
          <span className="text-xs text-white/55 group-hover:text-white/80 transition-colors">entrou em parcelas no período →</span>
        </Link>
      </div>
      <div className="mt-5 flex h-2 w-full overflow-hidden rounded-full bg-white/10">
        <motion.div className="h-full bg-white/70" initial={reduce ? false : { width: 0 }} animate={{ width: `${(outCents / total) * 100}%` }} transition={{ duration: 0.9, ease: EASE }} />
        <motion.div className="h-full bg-green-bright" initial={reduce ? false : { width: 0 }} animate={{ width: `${(inCents / total) * 100}%` }} transition={{ duration: 0.9, ease: EASE, delay: 0.1 }} />
      </div>
    </div>
  );
}

/** Proporção automática x humana com barra e percentual. */
export function AutomationStat({ autoCents, autoCount, human }: { autoCents: number; autoCount: number; human: number }) {
  const total = autoCount + human;
  const pct = total ? Math.round((autoCount / total) * 100) : 100;
  const reduce = useReducedMotion();
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Automação</span>
        <span className="text-2xl font-extrabold text-navy tabular-nums"><CountUp value={pct} />%</span>
      </div>
      <div className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-bg ring-1 ring-line">
        <motion.div className="h-full bg-green-bright" initial={reduce ? false : { width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, ease: EASE }} />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
        <div><dt className="text-muted">Baixa automática</dt><dd className="font-bold text-navy tabular-nums">{formatBRL(autoCents)} <span className="font-normal text-muted">· {autoCount} pgto(s)</span></dd></div>
        <div><dt className="text-muted">Intervenções humanas</dt><dd className="font-bold text-navy tabular-nums">{human} <span className="font-normal text-muted">conciliações/casos</span></dd></div>
      </dl>
    </div>
  );
}
