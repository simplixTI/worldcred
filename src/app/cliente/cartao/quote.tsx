"use client";
import { useActionState, useState } from "react";
import { motion } from "motion/react";
import { startCardAction } from "../actions";
import { Alert } from "@/components/ui";
import { CountUp } from "@/components/motion";
import { formatBRL, formatRate } from "@/lib/finance/money";
import { CreditCard, ShieldCheck } from "lucide-react";

interface Q { net: number; n: number; installment: number; last: number; gross: number; fees: number; cet: string; }

export function CardQuote({ amounts, maxInstallments, rate, quotes }: { amounts: number[]; maxInstallments: number; rate: string; quotes: Q[] }) {
  const [net, setNet] = useState(amounts[1] ?? amounts[0]);
  const [n, setN] = useState(Math.min(10, maxInstallments));
  const q = quotes.find((x) => x.net === net && x.n === n)!;
  const [state, action, pending] = useActionState(startCardAction, undefined);
  return (
    <form action={action} className="card p-6 space-y-5">
      <input type="hidden" name="net_cents" value={net} /><input type="hidden" name="installments" value={n} />
      <div><span className="label">Quanto você quer receber via Pix?</span>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2" role="radiogroup">
          {amounts.map((a) => <button type="button" key={a} role="radio" aria-checked={net === a} onClick={() => setNet(a)} className={`relative rounded-xl border px-2 py-3 text-sm font-bold tabular-nums transition-colors ${net === a ? "border-green text-green" : "border-line hover:border-navy/40"}`}>{net === a && <motion.span layoutId="card-amt" className="absolute inset-0 rounded-xl bg-green-soft" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}<span className="relative">{formatBRL(a).replace(",00", "")}</span></button>)}
        </div></div>
      <div><span className="label">Em quantas vezes no cartão?</span>
        <div className="flex flex-wrap gap-2" role="radiogroup">
          {Array.from({ length: maxInstallments }, (_, i) => i + 1).map((k) => <button type="button" key={k} role="radio" aria-checked={n === k} onClick={() => setN(k)} className={`relative rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors ${n === k ? "border-navy text-white" : "border-line hover:border-navy/40"}`}>{n === k && <motion.span layoutId="card-n" className="absolute inset-0 rounded-lg bg-navy" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}<span className="relative">{k}x</span></button>)}
        </div></div>
      <div className="rounded-2xl bg-navy text-white p-5 grid sm:grid-cols-2 gap-4">
        <div><div className="text-xs uppercase tracking-[0.12em] text-white/60">{n}x no cartão de</div><div className="text-4xl font-extrabold tabular-nums leading-none mt-1"><CountUp value={q.installment} kind="brl" duration={0.5} /></div>{q.last !== q.installment && <div className="text-xs text-white/60 mt-1">última de {formatBRL(q.last)}</div>}</div>
        <dl className="text-sm text-white/80 space-y-1 sm:text-right">
          <div><dt className="inline">Você recebe via Pix: </dt><dd className="inline font-bold text-green-bright tabular-nums">{formatBRL(q.net)}</dd></div>
          <div><dt className="inline">Total no cartão: </dt><dd className="inline font-bold text-white tabular-nums">{formatBRL(q.gross)}</dd></div>
          <div><dt className="inline">Custo da operação: </dt><dd className="inline font-bold text-white tabular-nums">{formatBRL(q.fees)}</dd></div>
          <div><dt className="inline">Taxa: </dt><dd className="inline tabular-nums">{formatRate(rate)} a.m. · CET {formatRate(q.cet)} a.m.</dd></div>
        </dl>
      </div>
      <ul className="text-xs text-muted space-y-1">
        <li className="flex items-center gap-2"><ShieldCheck size={14} className="text-green" /> Os dados do cartão são digitados apenas no checkout do Mercado Pago.</li>
        <li className="flex items-center gap-2"><CreditCard size={14} className="text-green" /> Depois da aprovação, o valor líquido é enviado para a sua chave Pix cadastrada. A dívida fica na fatura do cartão; não há parcelas Pix.</li>
      </ul>
      {state?.error && <Alert kind="danger">{state.error}</Alert>}
      <button className="btn-green w-full !py-3 text-base" disabled={pending}>{pending ? "Abrindo checkout…" : "Pagar com cartão e receber via Pix"}</button>
    </form>
  );
}
