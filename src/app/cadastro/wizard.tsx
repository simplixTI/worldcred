"use client";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { motion, AnimatePresence } from "motion/react";
import { selfSignupAction, publicLookupCpfAction, checkAgentCodeAction } from "./actions";
import { Alert, Field } from "@/components/ui";
import { Feedback } from "@/components/motion";
import { formatBRL, formatRate } from "@/lib/finance/money";
import { isValidCPF, onlyDigits } from "@/lib/utils/mask";
import { Check, Search, BadgeCheck } from "lucide-react";

interface Product { id: string; principal: number; terms: number[]; rate: string; }
interface Sim { pvId: string; term: number; installment: number; total: number; net: number; cet: string; last: number; }
const EASE = [0.16, 1, 0.3, 1] as const;
const STEPS = ["Crédito", "Seus dados", "Acesso"];

export function SignupWizard({ products, sims, initialRef, agentFirstName, initialPrincipal, initialTerm }: { products: Product[]; sims: Sim[]; initialRef: string; agentFirstName: string | null; initialPrincipal: number; initialTerm: number }) {
  const [step, setStep] = useState(0);
  const first = products.find((p) => p.principal === initialPrincipal) ?? products[1] ?? products[0];
  const [pvId, setPvId] = useState(first?.id ?? "");
  const product = products.find((p) => p.id === pvId) ?? first;
  const [term, setTerm] = useState(product?.terms.includes(initialTerm) ? initialTerm : product?.terms.includes(10) ? 10 : product?.terms[0] ?? 0);
  const sim = sims.find((s) => s.pvId === pvId && s.term === term);
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

  const canNext = step === 0 ? !!sim : step === 1 ? isValidCPF(vals.cpf) && vals.full_name.trim().length >= 5 && onlyDigits(vals.phone).length >= 10 && agent.ok !== false : true;

  return (
    <form action={action} className="space-y-6">
      {/* campos persistidos em todos os passos */}
      <input type="hidden" name="product_version_id" value={pvId} />
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
              <div><h1 className="text-2xl font-extrabold text-navy">Quanto você precisa?</h1><p className="text-muted text-sm mt-1">Crédito padrão com parcelas fixas a {formatRate(product?.rate ?? "0.15")} ao mês. Sem tarifas escondidas.</p></div>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2" role="radiogroup" aria-label="Valor">
                {products.map((p) => (
                  <button type="button" key={p.id} role="radio" aria-checked={pvId === p.id} onClick={() => { setPvId(p.id); if (!p.terms.includes(term)) setTerm(p.terms[0]); }}
                    className={`rounded-xl border px-2 py-3 text-sm font-bold tabular-nums transition-colors ${pvId === p.id ? "border-green bg-green-soft text-green" : "border-line hover:border-navy/40"}`}>{formatBRL(p.principal).replace(",00", "")}</button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Prazo">
                {product?.terms.map((t) => (
                  <button type="button" key={t} role="radio" aria-checked={term === t} onClick={() => setTerm(t)} className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${term === t ? "border-navy bg-navy text-white" : "border-line hover:border-navy/40"}`}>{t}x</button>
                ))}
              </div>
              {sim && (
                <div className="rounded-2xl bg-navy text-white p-5 grid sm:grid-cols-[1fr_auto] gap-4 items-end">
                  <div><div className="text-xs uppercase tracking-[0.12em] text-white/60">{term} parcelas de</div><div className="text-4xl font-extrabold tabular-nums leading-none mt-1">{formatBRL(sim.installment)}</div>{sim.last !== sim.installment && <div className="text-xs text-white/60 mt-1">última de {formatBRL(sim.last)}</div>}</div>
                  <dl className="text-xs text-white/75 space-y-1 sm:text-right"><div><dt className="inline">Você recebe via Pix: </dt><dd className="inline font-bold text-white tabular-nums">{formatBRL(sim.net)}</dd></div><div><dt className="inline">Total: </dt><dd className="inline font-bold text-white tabular-nums">{formatBRL(sim.total)}</dd></div><div><dt className="inline">CET: </dt><dd className="inline font-bold text-white tabular-nums">{formatRate(sim.cet)} a.m.</dd></div></dl>
                </div>
              )}
              <div className="rounded-xl border border-dashed border-line p-4 text-sm text-muted"><b className="text-navy">Crédito com o cartão</b> <span className="badge bg-warn-soft text-warn ml-1">em breve</span><br />Use o limite do cartão e receba via Pix, pagando na fatura. Avisaremos quando estiver disponível.</div>
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
              <div><h1 className="text-2xl font-extrabold text-navy">Crie seu acesso</h1><p className="text-muted text-sm mt-1">Com ele você lê e aceita a proposta, cadastra a chave Pix e acompanha as parcelas.</p></div>
              <div className="rounded-xl bg-bg p-4 text-sm grid sm:grid-cols-2 gap-2">
                <div><span className="text-muted">Crédito:</span> <b className="text-navy">{formatBRL(product?.principal ?? 0)} em {term}x de {formatBRL(sim?.installment ?? 0)}</b></div>
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
          : <button className="btn-green !px-6" disabled={pending}>{pending ? "Criando sua conta…" : "Concluir e ver minha proposta"}</button>}
      </div>
    </form>
  );
}
