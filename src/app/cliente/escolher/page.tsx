import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLoanSettings } from "@/lib/services/loan";
import { getCardSettings, quoteCard } from "@/lib/services/card";
import { buildSchedule } from "@/lib/finance/price";
import { PageTitle, Alert } from "@/components/ui";
import { ChoiceCards } from "./choice";
import Link from "next/link";

export default async function Escolher({ searchParams }: { searchParams: Promise<{ valor?: string; prazo?: string }> }) {
  const sp = await searchParams;
  const loan = await getLoanSettings();
  const card = await getCardSettings();
  const principal = Number(sp.valor); const term = Number(sp.prazo);
  if (!principal || !term) redirect("/cliente/credito");
  const p = Math.min(Math.max(principal, loan.min_cents), loan.max_cents);
  const t = Math.min(Math.max(term, loan.min_term), loan.max_term);
  const db = await createClient();
  const [{ data: me }, { data: pending }] = await Promise.all([
    db.from("customers").select("pix_key_status").maybeSingle(),
    db.from("proposals").select("id, number").in("status", ["sent", "accepted", "approved"]).limit(1).maybeSingle(),
  ]);
  const loanQ = buildSchedule({ principalCents: p, monthlyRate: loan.monthly_rate, termMonths: t });
  const cardTerm = Math.min(t, card.max_installments);
  const cardQ = card.live ? quoteCard(p, cardTerm, card.monthly_rate) : null;
  return (
    <>
      <PageTitle title="Como você quer o seu crédito?" subtitle="Mesmo valor, dois caminhos. Compare a parcela e escolha." />
      {pending && <div className="mb-4"><Alert kind="info">Você já tem a proposta #{pending.number} em andamento. <Link href={`/cliente/propostas/${pending.id}`} className="underline font-semibold">Abrir</Link></Alert></div>}
      {me?.pix_key_status !== "validated" && <div className="mb-4"><Alert kind="warn">Para receber o dinheiro, cadastre e valide sua chave Pix. <Link href="/cliente/pix" className="underline font-semibold">Cadastrar chave Pix</Link>. Você pode escolher a modalidade agora e cadastrar a chave em seguida.</Alert></div>}
      <ChoiceCards
        principal={p} term={t} hasPending={!!pending}
        loan={{ rate: loan.monthly_rate, installment: loanQ.regular_installment_cents, last: loanQ.last_installment_cents, total: loanQ.total_cents, cet: loanQ.cet_monthly }}
        card={cardQ ? { rate: card.monthly_rate, term: cardTerm, installment: cardQ.installment_cents, last: cardQ.last_installment_cents, total: cardQ.gross_cents, cet: cardQ.cet_monthly, maxTerm: card.max_installments, pixOk: me?.pix_key_status === "validated" } : null}
      />
    </>
  );
}
