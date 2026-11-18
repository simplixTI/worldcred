"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Feedback } from "@/components/motion";

type State = { error?: string; ok?: string } | undefined;

export function AssignSelect({ leadId, agents, act }: { leadId: string; agents: { id: string; full_name: string }[]; act: (leadId: string, agentId: string) => Promise<State> }) {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<State>();
  const router = useRouter();
  return (
    <div className="flex flex-col gap-1 min-w-44">
      <select className="input !py-1.5 text-xs" defaultValue="" disabled={pending} onChange={(e) => { const v = e.target.value; if (v) start(async () => { setRes(await act(leadId, v)); router.refresh(); }); }}>
        <option value="">{pending ? "Atribuindo…" : "Escolher agente…"}</option>
        {agents.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
      </select>
      <Feedback show={!!res?.ok} kind="ok">{res?.ok}</Feedback>
      <Feedback show={!!res?.error} kind="error">{res?.error}</Feedback>
    </div>
  );
}
