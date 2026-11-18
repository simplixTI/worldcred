"use client";
import { useState, useTransition } from "react";
import { inviteAction } from "../../actions";
import { Alert } from "@/components/ui";

export function InviteButton({ customerId }: { customerId: string }) {
  const [msg, setMsg] = useState<{ error?: string; ok?: string } | undefined>();
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <button className="btn-outline w-full" disabled={pending} onClick={() => start(async () => setMsg(await inviteAction(customerId)))}>{pending ? "Enviando…" : "Enviar convite por SMS"}</button>
      {msg?.ok && <Alert kind="success"><span className="break-all">{msg.ok}</span></Alert>}
      {msg?.error && <Alert kind="danger">{msg.error}</Alert>}
    </div>
  );
}
