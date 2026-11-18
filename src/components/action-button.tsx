"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Feedback } from "./motion";

type State = { error?: string; ok?: string } | undefined;

/** Botão genérico para Server Actions com confirmação/prompt opcional e feedback inline animado. */
export function ActionButton({ label, onRun, prompt: promptText, confirm: confirmText, className = "btn-outline !py-1.5 !px-3 text-xs", showResult = true }: {
  label: string; onRun: (note?: string) => Promise<State>; prompt?: string; confirm?: string; className?: string; showResult?: boolean;
}) {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<State>();
  const router = useRouter();
  return (
    <span className="inline-flex flex-col gap-1 max-w-md">
      <button className={className} disabled={pending} aria-busy={pending} onClick={() => start(async () => {
        let note: string | undefined;
        if (promptText) { const v = window.prompt(promptText); if (v === null) return; note = v; }
        if (confirmText && !window.confirm(confirmText)) return;
        const r = await onRun(note); setRes(r); router.refresh();
      })}>
        {pending ? <span className="inline-flex items-center gap-2"><span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" aria-hidden />Processando…</span> : label}
      </button>
      {showResult && <Feedback show={!!res?.ok} kind="ok"><span className="break-all">{res?.ok}</span></Feedback>}
      {showResult && <Feedback show={!!res?.error} kind="error"><span className="break-all">{res?.error}</span></Feedback>}
    </span>
  );
}
