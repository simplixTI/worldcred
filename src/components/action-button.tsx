"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Feedback } from "./motion";

type State = { error?: string; ok?: string } | undefined;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ServerAction = (...args: any[]) => Promise<State>;

/**
 * Botão para Server Actions. Recebe a referência da action e os argumentos (serializáveis),
 * para poder ser usado dentro de Server Components. Com `prompt`, o texto digitado é anexado como último argumento.
 */
export function ActionButton({ label, action, args = [], prompt: promptText, confirm: confirmText, className = "btn-outline !py-1.5 !px-3 text-xs", showResult = true }: {
  label: string; action: ServerAction; args?: unknown[]; prompt?: string; confirm?: string; className?: string; showResult?: boolean;
}) {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<State>();
  const router = useRouter();
  return (
    <span className="inline-flex flex-col gap-1 max-w-md">
      <button className={className} disabled={pending} aria-busy={pending} onClick={() => start(async () => {
        const finalArgs = [...args];
        if (promptText) { const v = window.prompt(promptText); if (v === null) return; finalArgs.push(v); }
        if (confirmText && !window.confirm(confirmText)) return;
        const r = await action(...finalArgs); setRes(r); router.refresh();
      })}>
        {pending ? <span className="inline-flex items-center gap-2"><span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" aria-hidden />Processando…</span> : label}
      </button>
      {showResult && <Feedback show={!!res?.ok} kind="ok"><span className="break-all">{res?.ok}</span></Feedback>}
      {showResult && <Feedback show={!!res?.error} kind="error"><span className="break-all">{res?.error}</span></Feedback>}
    </span>
  );
}
