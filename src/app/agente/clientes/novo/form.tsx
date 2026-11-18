"use client";
import { useActionState } from "react";
import { newCustomerAction } from "../../actions";
import { Alert, Field } from "@/components/ui";

export function NewCustomerForm() {
  const [state, action, pending] = useActionState(newCustomerAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <Field label="Nome completo"><input className="input" name="full_name" required minLength={5} /></Field>
      <Field label="CPF"><input className="input" name="cpf" inputMode="numeric" placeholder="000.000.000-00" required /></Field>
      <Field label="Celular (SMS)"><input className="input" name="phone" inputMode="tel" placeholder="(11) 99999-9999" required /></Field>
      <Field label="E-mail (opcional)"><input className="input" name="email" type="email" /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="invite" defaultChecked className="accent-green" /> Convidar o cliente por SMS para criar o acesso ao portal</label>
      {state?.error && <Alert kind="danger">{state.error}</Alert>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Salvando…" : "Cadastrar cliente"}</button>
    </form>
  );
}
