"use client";
import { useState } from "react";
import { LoanPicker, type PickerLimits } from "@/components/loan-picker";
import { ShieldCheck } from "lucide-react";

export function Simulator({ limits, rate, refSlug = "" }: { limits: PickerLimits; rate: string; refSlug?: string }) {
  const [principal, setPrincipal] = useState(Math.min(Math.max(200000, limits.min_cents), limits.max_cents));
  const [term, setTerm] = useState(Math.min(Math.max(10, limits.min_term), limits.max_term));
  const href = `/cadastro?valor=${principal}&prazo=${term}${refSlug ? `&ref=${encodeURIComponent(refSlug)}` : ""}`;
  return (
    <div className="rounded-3xl bg-navy-ink/60 backdrop-blur-md ring-1 ring-white/15 p-5 md:p-7 shadow-[0_40px_90px_-30px_rgba(0,0,0,0.7)]">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-bold text-white">Monte o seu crédito</h2>
        <span className="badge bg-green-bright/20 text-green-soft">sem compromisso</span>
      </div>
      <LoanPicker limits={limits} rate={rate} principal={principal} term={term} onPrincipal={setPrincipal} onTerm={setTerm} variant="hero">
        <a href={href} className="btn-green w-full mt-5 !py-3.5 text-base">Quero este crédito</a>
        <p className="text-[11px] text-white/50 mt-3 leading-relaxed flex items-start gap-1.5"><ShieldCheck size={13} className="mt-0.5 shrink-0" /> Parcelas fixas pela Tabela Price. Depois do cadastro você escolhe pagar em prestações via Pix ou com o cartão de crédito, com taxa menor. Sujeito a análise.</p>
      </LoanPicker>
    </div>
  );
}
