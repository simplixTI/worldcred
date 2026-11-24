"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoanPicker, type PickerLimits } from "@/components/loan-picker";

export function LoanRequest({ limits, rate, initialPrincipal, initialTerm }: { limits: PickerLimits; rate: string; initialPrincipal: number; initialTerm: number }) {
  const clampP = (v: number) => Math.min(Math.max(Math.round(v / limits.step_cents) * limits.step_cents, limits.min_cents), limits.max_cents);
  const clampT = (v: number) => Math.min(Math.max(v, limits.min_term), limits.max_term);
  const [principal, setPrincipal] = useState(clampP(initialPrincipal || 200000));
  const [term, setTerm] = useState(clampT(initialTerm || 10));
  const router = useRouter();
  return (
    <div className="card p-6 max-w-2xl">
      <LoanPicker limits={limits} rate={rate} principal={principal} term={term} onPrincipal={setPrincipal} onTerm={setTerm}>
        <button type="button" className="btn-green w-full mt-5 !py-3 text-base" onClick={() => router.push(`/cliente/escolher?valor=${principal}&prazo=${term}`)}>Continuar</button>
        <p className="text-xs text-muted mt-3">A parcela acima é da modalidade em prestações. No cartão de crédito a taxa é menor; você compara as duas na próxima tela.</p>
      </LoanPicker>
    </div>
  );
}
