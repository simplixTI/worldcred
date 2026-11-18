"use client";
import { useTransition } from "react";
import { agentCaseAction } from "../actions";

export function CaseButtons({ id, status }: { id: string; status: string }) {
  const [pending, start] = useTransition();
  const run = (a: "take" | "resolve" | "pause" | "resume") => start(async () => {
    const note = a === "resolve" ? prompt("Resolução:") ?? undefined : a === "pause" ? prompt("Motivo da pausa:") ?? undefined : undefined;
    if ((a === "resolve" || a === "pause") && !note) return;
    const r = await agentCaseAction(id, a, note);
    if (r?.error) alert(r.error);
  });
  return (
    <div className="flex gap-1 flex-wrap">
      {status === "open" && <button className="btn-outline !py-1 !px-2 text-xs" disabled={pending} onClick={() => run("take")}>Assumir</button>}
      {status === "assigned" && <button className="btn-outline !py-1 !px-2 text-xs" disabled={pending} onClick={() => run("pause")}>Pausar</button>}
      {status === "paused" && <button className="btn-outline !py-1 !px-2 text-xs" disabled={pending} onClick={() => run("resume")}>Retomar</button>}
      {status !== "open" && <button className="btn-green !py-1 !px-2 text-xs" disabled={pending} onClick={() => run("resolve")}>Resolver</button>}
    </div>
  );
}
