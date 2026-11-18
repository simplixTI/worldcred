"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createAgent } from "../actions";
import { Alert, Field } from "@/components/ui";

export function NewAgentForm() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>();
  const router = useRouter();
  return (
    <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); start(async () => { setMsg(await createAgent(String(f.get("name")), String(f.get("email")), String(f.get("password")), f.get("role") as "agent" | "admin")); router.refresh(); }); }}>
      <Field label="Nome"><input name="name" className="input" required /></Field>
      <Field label="E-mail"><input name="email" type="email" className="input" required /></Field>
      <Field label="Senha inicial"><input name="password" type="text" className="input" minLength={8} required /></Field>
      <Field label="Perfil"><select name="role" className="input"><option value="agent">Agente</option><option value="admin">Administrador (exige MFA)</option></select></Field>
      {msg?.ok && <Alert kind="success">{msg.ok}</Alert>}{msg?.error && <Alert kind="danger">{msg.error}</Alert>}
      <button className="btn-primary w-full" disabled={pending}>Criar</button>
    </form>
  );
}
