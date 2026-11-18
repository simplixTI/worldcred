"use client";
import { useActionState } from "react";
import { acceptInviteAction } from "../../actions";
import { Alert, Field } from "@/components/ui";

export function InviteForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(acceptInviteAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <Field label="E-mail"><input className="input" name="email" type="email" required /></Field>
      <Field label="Senha" hint="Mínimo de 8 caracteres"><input className="input" name="password" type="password" minLength={8} required /></Field>
      {state?.error && <Alert kind="danger">{state.error}</Alert>}
      <button className="btn-green w-full" disabled={pending}>{pending ? "Criando…" : "Criar acesso"}</button>
    </form>
  );
}
