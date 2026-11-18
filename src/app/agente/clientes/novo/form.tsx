"use client";
import { useActionState, useRef, useState, useTransition } from "react";
import { newCustomerAction, lookupCpfAction } from "../../actions";
import { Alert, Field } from "@/components/ui";
import { isValidCPF, onlyDigits } from "@/lib/utils/mask";
import { Feedback } from "@/components/motion";
import { Search } from "lucide-react";

export function NewCustomerForm() {
  const [state, action, pending] = useActionState(newCustomerAction, undefined);
  const [looking, startLookup] = useTransition();
  const [note, setNote] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [auto, setAuto] = useState<{ name?: boolean; phone?: boolean; email?: boolean }>({});
  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const lastCpf = useRef("");

  function consult(raw: string) {
    const cpf = onlyDigits(raw);
    if (!isValidCPF(cpf) || cpf === lastCpf.current) return;
    lastCpf.current = cpf;
    setNote(null);
    startLookup(async () => {
      const r = await lookupCpfAction(cpf);
      if ("error" in r) { setNote({ kind: "error", text: r.error }); return; }
      if (!r.available) { setNote({ kind: "error", text: `Consulta indisponível (${r.reason}). Preencha manualmente.` }); return; }
      if (!r.found) { setNote({ kind: "error", text: "CPF não localizado na base. Preencha manualmente." }); return; }
      const filled: string[] = []; const flags: typeof auto = {};
      if (r.fullName && nameRef.current && !nameRef.current.value) { nameRef.current.value = r.fullName; filled.push("nome"); flags.name = true; }
      if (r.phone && phoneRef.current && !phoneRef.current.value) { phoneRef.current.value = r.phone; filled.push("celular"); flags.phone = true; }
      if (r.email && emailRef.current && !emailRef.current.value) { emailRef.current.value = r.email; filled.push("e-mail"); flags.email = true; }
      setAuto(flags);
      setNote({ kind: "ok", text: filled.length ? `Preenchido automaticamente: ${filled.join(", ")}. Confira antes de salvar.` : "Dados localizados, mas os campos já estavam preenchidos." });
    });
  }

  return (
    <form action={action} className="space-y-3">
      <Field label="CPF" hint="Ao sair do campo, consultamos a base cadastral e preenchemos o que for possível.">
        <div className="relative">
          <input className="input pr-10" name="cpf" inputMode="numeric" placeholder="000.000.000-00" required onBlur={(e) => consult(e.target.value)} onChange={(e) => { if (onlyDigits(e.target.value).length === 11) consult(e.target.value); }} />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted">{looking ? <span className="block w-4 h-4 rounded-full border-2 border-green border-t-transparent animate-spin" aria-label="Consultando" /> : <Search size={16} />}</span>
        </div>
      </Field>
      <Feedback show={!!note} kind={note?.kind ?? "ok"}>{note?.text}</Feedback>
      <Field label="Nome completo"><input ref={nameRef} className={`input ${auto.name ? "border-green bg-green-soft/40" : ""}`} name="full_name" required minLength={5} onChange={() => setAuto((a) => ({ ...a, name: false }))} /></Field>
      <Field label="Celular (SMS)"><input ref={phoneRef} className={`input ${auto.phone ? "border-green bg-green-soft/40" : ""}`} name="phone" inputMode="tel" placeholder="(11) 99999-9999" required onChange={() => setAuto((a) => ({ ...a, phone: false }))} /></Field>
      <Field label="E-mail (opcional)"><input ref={emailRef} className={`input ${auto.email ? "border-green bg-green-soft/40" : ""}`} name="email" type="email" onChange={() => setAuto((a) => ({ ...a, email: false }))} /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="invite" defaultChecked className="accent-green" /> Convidar o cliente por SMS para criar o acesso ao portal</label>
      {state?.error && <Alert kind="danger">{state.error}</Alert>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Salvando…" : "Cadastrar cliente"}</button>
    </form>
  );
}
