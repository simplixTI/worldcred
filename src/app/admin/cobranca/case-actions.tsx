"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type State = { error?: string; ok?: string } | undefined;

export function CaseActions({ id, status, agents, act }: { id: string; status: string; agents: { id: string; full_name: string }[]; act: (id: string, action: string, note?: string, target?: string) => Promise<State> }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  const run = (action: string, note?: string, target?: string) => start(async () => { const r = await act(id, action, note, target); setErr(r?.error ?? null); router.refresh(); });
  return (
    <div className="flex flex-col gap-1 min-w-36">
      <div className="flex gap-1 flex-wrap">
        {status !== "paused" && <button className="btn-outline !py-1 !px-2 text-xs" disabled={pending} onClick={() => run("take")}>Assumir</button>}
        {status === "paused" ? <button className="btn-outline !py-1 !px-2 text-xs" disabled={pending} onClick={() => run("resume")}>Retomar</button>
          : <button className="btn-outline !py-1 !px-2 text-xs" disabled={pending} onClick={() => { const n = prompt("Motivo da pausa:"); if (n) run("pause", n); }}>Pausar</button>}
        <button className="btn-green !py-1 !px-2 text-xs" disabled={pending} onClick={() => { const n = prompt("Resolução:"); if (n) run("resolve", n); }}>Resolver</button>
      </div>
      <select className="input !py-1 text-xs" defaultValue="" disabled={pending} onChange={(e) => { if (e.target.value) run("reassign", undefined, e.target.value); }}>
        <option value="">Reatribuir para…</option>
        {agents.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
      </select>
      {err && <span className="text-xs text-danger">{err}</span>}
    </div>
  );
}
