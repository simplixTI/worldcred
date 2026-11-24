"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveSettings } from "../actions";
import { Alert, Field } from "@/components/ui";
import { parseBRLToCents } from "@/lib/finance/money";

type Loan = { monthly_rate: string; min_cents: number; max_cents: number; step_cents: number; min_term: number; max_term: number };
type Card = { monthly_rate: string; min_cents: number; max_cents: number; max_installments: number; enabled: boolean; allow_disburse_before_release: boolean; provider: string | null; integration_approved: boolean };

const pct = (r: string) => (Number(r) * 100).toFixed(2).replace(".", ",");
const brl = (c: number) => (c / 100).toFixed(2).replace(".", ",");
const rate = (s: string) => (Number(String(s).replace(",", ".")) / 100).toFixed(8);

export function ModalidadesForm({ loan, card }: { loan: Loan; card: Card }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>();
  const router = useRouter();
  return (
    <form className="space-y-4 text-sm" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); start(async () => {
      const r1 = await saveSettings("loan", { ...loan, monthly_rate: rate(String(f.get("loan_rate"))), min_cents: parseBRLToCents(String(f.get("loan_min"))), max_cents: parseBRLToCents(String(f.get("loan_max"))), step_cents: parseBRLToCents(String(f.get("loan_step"))), min_term: Number(f.get("loan_min_term")), max_term: Number(f.get("loan_max_term")) });
      const r2 = await saveSettings("card", { ...card, monthly_rate: rate(String(f.get("card_rate"))), min_cents: parseBRLToCents(String(f.get("card_min"))), max_cents: parseBRLToCents(String(f.get("card_max"))), max_installments: Number(f.get("card_max_term")) });
      setMsg(r1?.error ? r1 : r2?.error ? r2 : { ok: "Taxas e limites salvos. Valem para novas simulações e propostas; contratos existentes não mudam." }); router.refresh();
    }); }}>
      <fieldset className="space-y-2">
        <legend className="font-semibold text-navy">Prestações (Pix mensal)</legend>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Juros ao mês (%)"><input name="loan_rate" className="input" defaultValue={pct(loan.monthly_rate)} /></Field>
          <Field label="Passo do valor (R$)"><input name="loan_step" className="input" defaultValue={brl(loan.step_cents)} /></Field>
          <Field label="Valor mínimo (R$)"><input name="loan_min" className="input" defaultValue={brl(loan.min_cents)} /></Field>
          <Field label="Valor máximo (R$)"><input name="loan_max" className="input" defaultValue={brl(loan.max_cents)} /></Field>
          <Field label="Prazo mínimo (x)"><input name="loan_min_term" type="number" className="input" defaultValue={loan.min_term} /></Field>
          <Field label="Prazo máximo (x)"><input name="loan_max_term" type="number" className="input" defaultValue={loan.max_term} /></Field>
        </div>
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="font-semibold text-navy">Cartão de crédito</legend>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Juros ao mês (%)"><input name="card_rate" className="input" defaultValue={pct(card.monthly_rate)} /></Field>
          <Field label="Máximo de parcelas"><input name="card_max_term" type="number" className="input" defaultValue={card.max_installments} max={12} /></Field>
          <Field label="Valor mínimo (R$)"><input name="card_min" className="input" defaultValue={brl(card.min_cents)} /></Field>
          <Field label="Valor máximo (R$)"><input name="card_max" className="input" defaultValue={brl(card.max_cents)} /></Field>
        </div>
      </fieldset>
      {msg?.ok && <Alert kind="success">{msg.ok}</Alert>}{msg?.error && <Alert kind="danger">{msg.error}</Alert>}
      <button className="btn-primary" disabled={pending}>Salvar taxas e limites</button>
    </form>
  );
}
