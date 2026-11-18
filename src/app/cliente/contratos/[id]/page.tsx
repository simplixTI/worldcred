import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ContractView } from "@/components/contract-view";

export default async function ClienteContrato({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await createClient();
  const { data: c } = await db.from("contracts").select("*, customers(full_name, cpf), installments(*), disbursements(id, reference, status, amount_cents, pix_key, confirmed_at, last_error, attempts)").eq("id", id).maybeSingle();
  if (!c) notFound();
  return <ContractView contract={c} basePath="/cliente" payLinks />;
}
