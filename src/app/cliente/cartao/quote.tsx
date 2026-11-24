"use client";
import { useMemo, useState, useTransition } from "react";
import { motion, AnimatePresence } from "motion/react";
import { createCardOperationAction } from "../actions";
import { Alert } from "@/components/ui";
import { CountUp } from "@/components/motion";
import { formatBRL, formatRate } from "@/lib/finance/money";
import { buildSchedule } from "@/lib/finance/price";
import { CreditCard, ShieldCheck } from "lucide-react";
import { CardBrick } from "./brick";

interface Limits { min_cents: number; max_cents: number; step_cents: number; max_installments: number; }

function Range({ value, min, max, step, onChange, label, format, disabled }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; label: string; format: (v: number) => string; disabled?: boolean }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className="block">
      <span className="flex items-baseline justify-between mb-2 text-muted"><span className="text-[11px] font-semibold uppercase tracking-[0.1em]">{label}</span><span className="text-lg font-extrabold tabular-nums text-navy">{format(value)}</span></span>
      <input type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} className="wc-range w-full disabled:opacity-60" style={{ "--pct": `${pct}%` } as React.CSSProperties} />
    </label>
  );
}

export function CardQuote({ limits, rate, publicKey, initialPrincipal, initialTerm }: { limits: Limits; rate: string; publicKey: string | null; initialPrincipal: number; initialTerm: number }) {
  const clampP = (v: number) => Math.min(Math.max(Math.round(v / limits.step_cents) * limits.step_cents, limits.min_cents), limits.max_cents);
  const [net, setNet] = useState(clampP(initialPrincipal || 200000));
  const [n, setN] = useState(Math.min(Math.max(initialTerm || 10, 1), limits.max_installments));
  const q = useMemo(() => { const s = buildSchedule({ principalCents: net, monthlyRate: rate, termMonths: n }); const per = Math.round(s.total_cents / n); return { installment: per, last: s.total_cents - per * (n - 1), gross: s.total_cents, fees: s.total_cents - net, cet: s.cet_monthly }; }, [net, n, rate]);
  const [creating, start] = useTransition();
  const [op, setOp] = useState<{ operationId: string; grossCents: number; email: string; cpf: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (!publicKey) return <Alert kind="warn">Checkout do cartão indisponível: chave pública do Mercado Pago não configurada.</Alert>;

  return (
    <div className="space-y-5">
      <div className="card p-6 space-y-5">
        <Range label="Quanto você quer receber via Pix" value={net} min={limits.min_cents} max={limits.max_cents} step={limits.step_cents} onChange={setNet} format={(v) => formatBRL(v).replace(",00", "")} disabled={!!op} />
        <Range label="Em quantas vezes no cartão" value={n} min={1} max={limits.max_installments} step={1} onChange={setN} format={(v) => `${v}x`} disabled={!!op} />
        <div className="rounded-2xl bg-navy text-white p-5 grid sm:grid-cols-2 gap-4">
          <div><div className="text-xs uppercase tracking-[0.12em] text-white/60">{n}x no cartão de</div><div className="text-4xl font-extrabold tabular-nums leading-none mt-1"><CountUp value={q.installment} kind="brl" duration={0.45} /></div>{q.last !== q.installment && <div className="text-xs text-white/60 mt-1">última de {formatBRL(q.last)}</div>}</div>
          <dl className="text-sm text-white/80 space-y-1 sm:text-right">
            <div><dt className="inline">Você recebe via Pix: </dt><dd className="inline font-bold text-green-bright tabular-nums">{formatBRL(net)}</dd></div>
            <div><dt className="inline">Total no cartão: </dt><dd className="inline font-bold text-white tabular-nums">{formatBRL(q.gross)}</dd></div>
            <div><dt className="inline">Custo: </dt><dd className="inline font-bold text-white tabular-nums">{formatBRL(q.fees)}</dd></div>
            <div><dt className="inline">Taxa: </dt><dd className="inline tabular-nums">{formatRate(rate)} a.m. · CET {formatRate(q.cet)} a.m.</dd></div>
          </dl>
        </div>
        <ul className="text-xs text-muted space-y-1">
          <li className="flex items-center gap-2"><ShieldCheck size={14} className="text-green" /> O cartão é digitado em um formulário seguro do Mercado Pago, aqui mesmo; a WorldCred recebe só um token.</li>
          <li className="flex items-center gap-2"><CreditCard size={14} className="text-green" /> Aprovado o pagamento, a WorldCred envia o valor para a sua chave Pix. Contrato quitado: a dívida fica na fatura, sem cobrança mensal.</li>
        </ul>
        {err && <Alert kind="danger">{err}</Alert>}
        {!op && <button type="button" className="btn-green w-full !py-3 text-base" disabled={creating} onClick={() => start(async () => { setErr(null); const r = await createCardOperationAction(net, n); if (r.error || !r.operationId) { setErr(r.error ?? "erro"); return; } setOp({ operationId: r.operationId, grossCents: r.grossCents!, email: r.email!, cpf: r.cpf! }); })}>{creating ? "Preparando…" : "Continuar para o pagamento"}</button>}
        {op && <button type="button" className="btn-outline" onClick={() => setOp(null)}>Alterar valor ou parcelas</button>}
      </div>
      <AnimatePresence>{op && <motion.div key={op.operationId} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><CardBrick operationId={op.operationId} grossCents={op.grossCents} installments={n} email={op.email} cpf={op.cpf} publicKey={publicKey} /></motion.div>}</AnimatePresence>
    </div>
  );
}
