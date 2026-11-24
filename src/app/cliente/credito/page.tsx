import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getLoanSettings } from "@/lib/services/loan";
import { PageTitle, Alert } from "@/components/ui";
import { LoanRequest } from "./request";

export default async function ClienteCredito({ searchParams }: { searchParams: Promise<{ valor?: string; prazo?: string }> }) {
  const sp = await searchParams;
  const db = await createClient();
  const { data: pending } = await db.from("proposals").select("id, number, status").in("status", ["sent", "accepted", "approved"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const limits = await getLoanSettings();
  return (
    <>
      <PageTitle title="Pedir crédito" subtitle="Escolha o valor e em quantas vezes. Na próxima tela você decide entre prestações via Pix ou cartão de crédito." />
      {pending ? (
        <Alert kind="info">Você já tem a proposta #{pending.number} em andamento. <Link href={`/cliente/propostas/${pending.id}`} className="underline font-semibold">Abrir proposta</Link></Alert>
      ) : (
        <LoanRequest limits={limits} rate={limits.monthly_rate} initialPrincipal={Number(sp.valor) || 0} initialTerm={Number(sp.prazo) || 0} />
      )}
    </>
  );
}
