"use client";
import { useActionState, useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { createLeadAction } from "@/app/landing-actions";
import { Alert, Field } from "@/components/ui";
import { formatBRL } from "@/lib/finance/money";
import { SELECTION_EVENT } from "./simulator";
import { CheckCircle2 } from "lucide-react";

export function LeadForm({ refSlug, agentName }: { refSlug: string | null; agentName: string | null }) {
  const [state, action, pending] = useActionState(createLeadAction, undefined);
  const [sel, setSel] = useState<{ principal: number; term: number } | null>(null);
  useEffect(() => {
    const h = (e: Event) => setSel((e as CustomEvent).detail);
    window.addEventListener(SELECTION_EVENT, h);
    return () => window.removeEventListener(SELECTION_EVENT, h);
  }, []);

  return (
    <AnimatePresence mode="wait">
      {state?.ok ? (
        <motion.div key="ok" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="card p-8 text-center">
          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 18, delay: 0.1 }} className="mx-auto grid place-items-center w-16 h-16 rounded-full bg-green-soft text-green mb-4"><CheckCircle2 size={32} /></motion.span>
          <h3 className="text-xl font-bold text-navy">Solicitação recebida</h3>
          <p className="text-muted mt-2">{state.ok}</p>
        </motion.div>
      ) : (
        <motion.form key="form" action={action} className="card p-6 md:p-8 space-y-4" initial={false}>
          <input type="hidden" name="ref" value={refSlug ?? ""} />
          <input type="hidden" name="amount_cents" value={sel?.principal ?? ""} />
          <input type="hidden" name="term_months" value={sel?.term ?? ""} />
          {sel && <div className="rounded-xl bg-green-soft text-green text-sm px-3 py-2">Você escolheu <b>{formatBRL(sel.principal).replace(",00", "")}</b> em <b>{sel.term}x</b>. Pode ajustar depois com seu agente.</div>}
          {agentName && <div className="text-sm text-muted">Atendimento por <b className="text-navy">{agentName}</b>.</div>}
          <Field label="Nome completo"><input className="input" name="full_name" required minLength={5} autoComplete="name" /></Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="CPF"><input className="input" name="cpf" inputMode="numeric" placeholder="000.000.000-00" required /></Field>
            <Field label="Celular com DDD"><input className="input" name="phone" inputMode="tel" placeholder="(11) 99999-9999" required autoComplete="tel" /></Field>
          </div>
          <Field label="E-mail (opcional)"><input className="input" name="email" type="email" autoComplete="email" /></Field>
          <label className="flex items-start gap-2 text-xs text-muted"><input type="checkbox" name="consent" className="mt-0.5 accent-green" required /> Autorizo a WorldCred a entrar em contato por SMS e telefone e a consultar meus dados para análise de crédito, conforme a LGPD.</label>
          {state?.error && <Alert kind="danger">{state.error}</Alert>}
          <button className="btn-green w-full !py-3 text-base" disabled={pending}>{pending ? "Enviando…" : "Quero crédito"}</button>
        </motion.form>
      )}
    </AnimatePresence>
  );
}
