import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { activeProductVersions, simulate } from "@/lib/services/proposals";
import { PageTitle, Alert } from "@/components/ui";
import { LoanRequest } from "./request";

export default async function ClienteCredito() {
  const db = await createClient();
  const { data: pending } = await db.from("proposals").select("id, number, status").in("status", ["sent", "accepted", "approved"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const versions = await activeProductVersions();
  const products = versions.map((v) => ({ id: v.id, principal: v.products.principal_cents, terms: v.allowed_terms, rate: v.monthly_rate }));
  const sims = versions.flatMap((v) => v.allowed_terms.map((t) => { const s = simulate(v, t); return { pvId: v.id, term: t, installment: s.regular_installment_cents, total: s.total_cents, net: s.net_cents, cet: s.cet_monthly, last: s.last_installment_cents }; }));
  return (
    <>
      <PageTitle title="Pedir crédito" subtitle="Crédito padrão com parcelas fixas. Escolha o valor e o prazo; a proposta fica pronta para você ler e aceitar." />
      {pending ? (
        <Alert kind="info">Você já tem a proposta #{pending.number} em andamento. <Link href={`/cliente/propostas/${pending.id}`} className="underline font-semibold">Abrir proposta</Link></Alert>
      ) : (
        <LoanRequest products={products} sims={sims} />
      )}
    </>
  );
}
