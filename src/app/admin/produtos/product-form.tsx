"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveProductVersion } from "../actions";
import { Alert, Field } from "@/components/ui";
import { parseBRLToCents } from "@/lib/finance/money";

export function ProductForm({ product }: { product?: { id: string; name: string; principalCents: number; active: boolean; rate: string; terms: number[]; fee: number } }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>();
  const router = useRouter();
  return (
    <form className="space-y-2 text-sm" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); start(async () => {
      setMsg(await saveProductVersion({
        productId: product?.id, name: String(f.get("name")), principalCents: product ? product.principalCents : parseBRLToCents(String(f.get("principal"))),
        monthlyRate: (Number(String(f.get("rate")).replace(",", ".")) / 100).toFixed(8), allowedTerms: String(f.get("terms")).split(/[,\s]+/).map(Number).filter((n) => n > 0),
        feeCents: parseBRLToCents(String(f.get("fee") || "0")), validFrom: String(f.get("valid_from")), active: f.get("active") === "on",
      })); router.refresh(); }); }}>
      <Field label="Nome"><input name="name" className="input" defaultValue={product?.name ?? ""} required /></Field>
      {!product && <Field label="Valor (R$)"><input name="principal" className="input" placeholder="1.000,00" required /></Field>}
      <Field label="Taxa mensal (%)"><input name="rate" className="input" defaultValue={(Number(product?.rate ?? 0.15) * 100).toFixed(2)} required /></Field>
      <Field label="Prazos permitidos (meses)"><input name="terms" className="input" defaultValue={(product?.terms ?? [3, 6, 10, 12]).join(", ")} required /></Field>
      <Field label="Tarifa (R$)"><input name="fee" className="input" defaultValue={((product?.fee ?? 0) / 100).toFixed(2).replace(".", ",")} /></Field>
      <Field label="Vigência a partir de"><input name="valid_from" type="date" className="input" defaultValue={new Date().toISOString().slice(0, 10)} required /></Field>
      <label className="flex items-center gap-2"><input type="checkbox" name="active" defaultChecked={product?.active ?? true} className="accent-green" /> Produto ativo</label>
      {msg?.ok && <Alert kind="success">{msg.ok}</Alert>}{msg?.error && <Alert kind="danger">{msg.error}</Alert>}
      <button className="btn-primary w-full" disabled={pending}>{product ? "Publicar nova versão" : "Criar produto"}</button>
    </form>
  );
}
