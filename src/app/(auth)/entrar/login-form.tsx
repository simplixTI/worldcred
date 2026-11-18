"use client";
import { useActionState } from "react";
import { signIn } from "../actions";
import { Alert, Field } from "@/components/ui";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signIn, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="next" value={next} />
      <Field label="E-mail"><input className="input" name="email" type="email" autoComplete="username" required /></Field>
      <Field label="Senha"><input className="input" name="password" type="password" autoComplete="current-password" required /></Field>
      {state?.error && <Alert kind="danger">{state.error}</Alert>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Entrando…" : "Entrar"}</button>
    </form>
  );
}
