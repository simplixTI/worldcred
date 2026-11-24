"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { chooseInstallmentsAction } from "../actions";
import { Alert } from "@/components/ui";
import { formatBRL, formatRate } from "@/lib/finance/money";
import { CalendarClock, CreditCard, Zap, BadgeCheck } from "lucide-react";

interface LoanQ { rate: string; installment: number; last: number; total: number; cet: string; }
interface CardQ extends LoanQ { term: number; maxTerm: number; pixOk: boolean; }
const EASE = [0.16, 1, 0.3, 1] as const;

export function ChoiceCards({ principal, term, loan, card, hasPending }: { principal: number; term: number; loan: LoanQ; card: CardQ | null; hasPending: boolean }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  const pick = (kind: "loan" | "card") => start(async () => {
    setErr(null);
    if (kind === "card") { router.push(`/cliente/cartao?valor=${principal}&prazo=${card?.term ?? term}`); return; }
    const r = await chooseInstallmentsAction(principal, term);
    if (r?.error) setErr(r.error);
  });
  return (
    <div className="space-y-4">
      <div className="text-sm text-muted">Você pediu <b className="text-navy">{formatBRL(principal)}</b> em <b className="text-navy">{term}x</b>. <a href={`/cliente/credito?valor=${principal}&prazo=${term}`} className="underline">Alterar</a></div>
      {err && <Alert kind="danger">{err}</Alert>}
      <div className="grid md:grid-cols-2 gap-4">
        <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: EASE }} className="card p-6 flex flex-col">
          <div className="flex items-center gap-3"><span className="grid place-items-center w-11 h-11 rounded-xl bg-navy/10 text-navy"><CalendarClock size={20} /></span><div><h2 className="font-bold text-navy text-lg">Prestações mensais</h2><p className="text-xs text-muted">Pix na conta, parcelas por QR Code</p></div></div>
          <div className="mt-5"><div className="text-xs uppercase tracking-[0.12em] text-muted">{term} parcelas de</div><div className="text-4xl font-extrabold text-navy tabular-nums leading-none mt-1">{formatBRL(loan.installment)}</div></div>
          <dl className="mt-4 text-sm space-y-1 text-muted"><div className="flex justify-between"><dt>Juros</dt><dd className="text-navy font-semibold">{formatRate(loan.rate)} a.m.</dd></div><div className="flex justify-between"><dt>Total</dt><dd className="text-navy font-semibold tabular-nums">{formatBRL(loan.total)}</dd></div><div className="flex justify-between"><dt>CET</dt><dd className="text-navy font-semibold">{formatRate(loan.cet)} a.m.</dd></div></dl>
          <ul className="mt-4 text-xs text-muted space-y-1"><li className="flex gap-2"><BadgeCheck size={14} className="text-green shrink-0" /> Passa por análise e aprovação; depois o Pix é enviado</li><li className="flex gap-2"><BadgeCheck size={14} className="text-green shrink-0" /> Lembretes por SMS antes do vencimento</li></ul>
          <button className="btn-primary w-full mt-auto pt-3 !py-3" disabled={pending || hasPending} onClick={() => pick("loan")}>{pending ? "Gerando proposta…" : "Quero em prestações"}</button>
        </motion.section>
        <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: EASE, delay: 0.08 }} className={`card p-6 flex flex-col relative overflow-hidden ${card ? "border-green/50" : "opacity-70"}`}>
          {card && <span className="absolute right-4 top-4 badge bg-green-soft text-green"><Zap size={12} className="mr-1" />taxa menor</span>}
          <div className="flex items-center gap-3"><span className="grid place-items-center w-11 h-11 rounded-xl bg-green-soft text-green"><CreditCard size={20} /></span><div><h2 className="font-bold text-navy text-lg">Cartão de crédito</h2><p className="text-xs text-muted">Paga agora no cartão, recebe via Pix</p></div></div>
          {card ? (
            <>
              <div className="mt-5"><div className="text-xs uppercase tracking-[0.12em] text-muted">{card.term} parcelas no cartão de</div><div className="text-4xl font-extrabold text-green tabular-nums leading-none mt-1">{formatBRL(card.installment)}</div>{card.term < term && <div className="text-[11px] text-muted mt-1">no cartão o máximo é {card.maxTerm}x</div>}</div>
              <dl className="mt-4 text-sm space-y-1 text-muted"><div className="flex justify-between"><dt>Juros</dt><dd className="text-navy font-semibold">{formatRate(card.rate)} a.m.</dd></div><div className="flex justify-between"><dt>Total</dt><dd className="text-navy font-semibold tabular-nums">{formatBRL(card.total)}</dd></div><div className="flex justify-between"><dt>CET</dt><dd className="text-navy font-semibold">{formatRate(card.cet)} a.m.</dd></div></dl>
              <ul className="mt-4 text-xs text-muted space-y-1"><li className="flex gap-2"><BadgeCheck size={14} className="text-green shrink-0" /> Sem análise de crédito: aprovado o cartão, o Pix é liberado</li><li className="flex gap-2"><BadgeCheck size={14} className="text-green shrink-0" /> Contrato quitado na hora; a dívida fica na fatura</li></ul>
              <button className="btn-green w-full mt-auto !py-3" disabled={pending} onClick={() => pick("card")}>{card.pixOk ? "Pagar com cartão e receber via Pix" : "Continuar com cartão"}</button>
            </>
          ) : <p className="mt-5 text-sm text-muted">Modalidade indisponível no momento.</p>}
        </motion.section>
      </div>
    </div>
  );
}
