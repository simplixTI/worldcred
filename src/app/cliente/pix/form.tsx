"use client";
import { useActionState } from "react";
import { setPixKeyAction } from "../actions";
import { Alert, Field } from "@/components/ui";

export function PixKeyForm() {
  const [state, action, pending] = useActionState(setPixKeyAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <Field label="Chave Pix (CPF, e-mail, celular ou chave aleatória)"><input className="input" name="pix_key" required /></Field>
      {state?.ok && <Alert kind="success">{state.ok}</Alert>}
      {state?.error && <Alert kind="danger">{state.error}</Alert>}
      <button className="btn-green w-full" disabled={pending}>{pending ? "Validando…" : "Salvar e validar"}</button>
    </form>
  );
}
