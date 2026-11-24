"use client";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { motion, AnimatePresence } from "motion/react";
import { selfSignupAction, publicLookupCpfAction, checkAgentCodeAction } from "./actions";
import { Alert, Field } from "@/components/ui";
import { Feedback } from "@/components/motion";
import { formatBRL } from "@/lib/finance/money";
import { LoanPicker, useLoanQuote, type PickerLimits } from "@/components/loan-picker";
import { isValidCPF, onlyDigits } from "@/lib/utils/mask";
import { Check, Search, BadgeCheck } from "lucide-react";

const EASE = [0.16, 1, 0.3, 1] as const;
const STEPS = ["Crédito", "Seus dados", "Acesso"];

export function SignupWizard({ limits, rate, initialRef, agentFirstName, initialPrincipal, initialTerm }: { limits: PickerLimits; rate: string; initialRef: string; agentFirstName: string | null; initialPrincipal: number; initialTerm: number }) {
  const [step, setStep] = useState(0);
  const clampP = (v: number) => Math.min(Math.max(Math.round(v / limits.step_cents) * limits.step_cents, limits.min_cents), limits.max_cents);
  const clampT = (v: number) => Math.min(Math.max(v, limits.min_term), limits.max_term);
  const [principal, setPrincipal] = useState(clampP(initialPrincipal || 200000));
  const [term, setTerm] = useState(clampT(initialTerm || 10));
  const sim = useLoanQuote(principal, term, rate);
  const [state, action, pending] = useActionState(selfSignupAction, undefined);

  // dados pessoais
  const [looking, startLookup] = useTransition();
  const [note, setNote] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const lastCpf = useRef("");
  const [agent, setAgent] = useState<{ code: string; ok: boolean | null; name?: string }>({ code: initialRef, ok: agentFirstName ? true : initialRef ? false : null, name: agentFirstName ?? undefined });
  const [checking, startCheck] = useTransition();
  // campos controlados que precisam sobreviver à troca de passo
  const [vals, setVals] = useState({ cpf: "", full_name: "", phone: "", email: "" });
  const set = (k: keyof typeof vals) => (e: React.ChangeEvent<HTMLInputElement>) => setVals((v) => ({ ...v, [k]: e.target.value }));

  function consult(raw: string) {
    const cpf = onlyDigits(raw);
    if (!isValidCPF(cpf) || cpf === lastCpf.current) return;
    lastCpf.current = cpf; setNote(null);
    startLookup(async () => {
      const r = await publicLookupCpfAction(cpf);
      if ("error" in r) { setNote({ kind: "error", text: r.error }); return; }
      if (!r.available || !r.found) { setNote({ kind: "error", text: "Não localizamos seus dados automaticamente. Preencha abaixo." }); return; }
      setVals((v) => ({ ...v, full_name: v.full_name || r.fullName || "", phone: v.phone || r.phone || "", email: v.email || r.email || "" }));
      setNote({ kind: "ok", text: "Encontramos seus dados. Confira e ajuste se precisar." });
    });
  }
  function verifyAgent(code: string) {
    if (!code.trim()) { setAgent({ code, ok: null }); return; }
    startCheck(async () => { const r = await checkAgentCodeAction(code); setAgent({ code, ok: r.ok, name: r.firstName }); });
  }
  useEffect(() => { if (state?.error) window.scrollTo({ top: 0, behavior: "smooth" }); }, [state]);

  const canNext = step === 0 ? true : step === 1 ? isValidCPF(vals.cpf) && vals.full_name.trim().length >= 5 && onlyDigits(vals.phone).length >= 10 && agent.ok !== false : true;

  return (
    <form action={action} className="space-y-6">
      {/* campos persistidos em todos os passos */}
      <input type="hidden" name="principal_cents" value={principal} />
      <input type="hidden" name="term_months" value={term} />
      <input type="hidden" name="agent_code" value={agent.code} />
      {step !== 1 && (<><input type="hidden" name="cpf" value={vals.cpf} /><input type="hidden" name="full_name" value={vals.full_name} /><input type="hidden" name="phone" value={vals.phone} /></>)}
      {step !== 2 && <input type="hidden" name="email" value={vals.email} />}

      <ol className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em]">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <span className={`grid place-items-center w-6 h-6 rounded-full text-[11px] ${i < step ? "bg-green text-white" : i === step ? "bg-navy text-white" : "bg-line text-muted"}`}>{i < step ? <Check size={13} /> : i + 1}</span>
            <span className={i === step ? "text-navy" : "text-muted"}>{s}</span>
            {i < STEPS.length - 1 && <span className="w-6 h-px bg-line" aria-hidden />}
          </li>
        ))}
      </ol>

      {state?.error && <Alert kind="danger">{state.error}</Alert>}

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.3, ease: EASE }}>
          {step === 0 && (
            <section className="card p-6 space-y-5">
              <div><h1 className="text-2xl font-extrabold text-navy">Quanto você precisa?</h1><p className="text-muted text-sm mt-1">Arraste e veja a parcela na hora. Depois do cadastro você escolhe entre prestações via Pix ou cartão de crédito, com taxa menor.</p></div>
              <LoanPicker limits={limits} rate={rate} principal={principal} term={term} onPrincipal={setPrincipal} onTerm={setTerm} />
            </section>
          )}

          {step === 1 && (
            <section className="card p-6 space-y-4">
              <div><h1 className="text-2xl font-extrabold text-navy">Seus dados</h1><p className="text-muted text-sm mt-1">Digite o CPF e tentamos preencher o restante para você.</p></div>
              <Field label="CPF">
                <div className="relative">
                  <input className="input pr-10" name="cpf" inputMode="numeric" placeholder="000.000.000-00" required value={vals.cpf} onChange={(e) => { set("cpf")(e); if (onlyDigits(e.target.value).length === 11) consult(e.target.value); }} onBlur={(e) => consult(e.target.value)} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted">{looking ? <span className="block w-4 h-4 rounded-full border-2 border-green border-t-transparent animate-spin" aria-label="Consultando" /> : <Search size={16} />}</span>
                </div>
              </Field>
              <Feedback show={!!note} kind={note?.kind ?? "ok"}>{note?.text}</Feedback>
              <Field label="Nome completo"><input className="input" name="full_name" required minLength={5} value={vals.full_name} onChange={set("full_name")} autoComplete="name" /></Field>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Celular com DDD"><input className="input" name="phone" inputMode="tel" placeholder="(11) 99999-9999" required value={vals.phone} onChange={set("phone")} autoComplete="tel" /></Field>
                <Field label="E-mail"><input className="input" type="email" value={vals.email} onChange={set("email")} autoComplete="email" /></Field>
              </div>
              <Field label="ID do agente que indicou você" hint="Opcional. Formato WC1001. Quem indicou acompanha seu pedido.">
                <div className="relative">
                  <input className={`input pr-10 uppercase ${agent.ok === true ? "border-green" : agent.ok === false ? "border-danger" : ""}`} value={agent.code} onChange={(e) => setAgent({ code: e.target.value.toUpperCase(), ok: null })} onBlur={(e) => verifyAgent(e.target.value)} placeholder="WC1001" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2">{checking ? <span className="block w-4 h-4 rounded-full border-2 border-green border-t-transparent animate-spin" /> : agent.ok === true ? <BadgeCheck size={18} className="text-green" /> : null}</span>
                </div>
                {agent.ok === true && agent.name && <span className="block text-xs text-green mt-1">Indicação de {agent.name} confirmada.</span>}
                {agent.ok === false && <span className="block text-xs text-danger mt-1">ID não encontrado. Confira com quem indicou você ou deixe em branco.</span>}
              </Field>
            </section>
          )}

          {step === 2 && (
            <section className="card p-6 space-y-4">
              <div><h1 className="text-2xl font-extrabold text-navy">Crie seu acesso</h1><p className="text-muted text-sm mt-1">Com ele você escolhe como receber, cadastra a chave Pix e acompanha tudo.</p></div>
              <div className="rounded-xl bg-bg p-4 text-sm grid sm:grid-cols-2 gap-2">
                <div><span className="text-muted">Crédito:</span> <b className="text-navy">{formatBRL(principal)} em {term}x (prestação de {formatBRL(sim.regular_installment_cents)})</b></div>
                <div><span className="text-muted">Nome:</span> <b className="text-navy">{vals.full_name}</b></div>
                <div><span className="text-muted">Celular:</span> <b className="text-navy">{vals.phone}</b></div>
                <div><span className="text-muted">Agente:</span> <b className="text-navy">{agent.ok ? `${agent.name} (${agent.code})` : "sem indicação"}</b></div>
              </div>
              <Field label="E-mail (será seu login)"><input className="input" name="email" type="email" required value={vals.email} onChange={set("email")} autoComplete="username" /></Field>
              <Field label="Senha" hint="Mínimo de 8 caracteres"><input className="input" name="password" type="password" minLength={8} required autoComplete="new-password" /></Field>
              <label className="flex items-start gap-2 text-xs text-muted"><input type="checkbox" name="consent" className="mt-0.5 accent-green" required /> Autorizo a WorldCred (World Serviços de Crédito LTDA) a consultar meus dados para análise de crédito e a entrar em contato por SMS e telefone, conforme a LGPD.</label>
            </section>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="flex items-center justify-between gap-3">
        <button type="button" className="btn-outline" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || pending}>Voltar</button>
        {step < 2
          ? <button type="button" className="btn-green !px-6" disabled={!canNext} onClick={() => { if (step === 1 && agent.code && agent.ok === null) verifyAgent(agent.code); setStep(step + 1); }}>Continuar</button>
          : <button className="btn-green !px-6" disabled={pending}>{pending ? "Criando sua conta…" : "Concluir e escolher como pagar"}</button>}
      </div>
    </form>
  );
}
