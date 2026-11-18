import { createClient } from "@/lib/supabase/server";
import { activeProductVersions, simulate } from "@/lib/services/proposals";
import { PageTitle, Empty } from "@/components/ui";
import { ProposalWizard } from "./wizard";

export default async function NovaPropostaPage({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  const sp = await searchParams;
  const db = await createClient();
  const { data: customers } = await db.from("customers").select("id, full_name, cpf, pix_key_status, user_id").order("full_name");
  const versions = await activeProductVersions();
  // pré-cálculo no servidor de todas as combinações (catálogo pequeno)
  const sims = versions.flatMap((v) => v.allowed_terms.map((t) => ({ pvId: v.id, term: t, snap: simulate(v, t) })));
  if (!customers?.length) return <Empty>Cadastre um cliente antes de simular.</Empty>;
  return (
    <>
      <PageTitle title="Nova proposta" subtitle="Escolha produto e prazo; o cálculo é feito no servidor pela Tabela Price." />
      <ProposalWizard
        customers={customers.map((c) => ({ id: c.id, name: c.full_name, cpf: c.cpf, hasAccess: !!c.user_id, pixStatus: c.pix_key_status }))}
        products={versions.map((v) => ({ id: v.id, name: v.products.name, principal: v.products.principal_cents, rate: v.monthly_rate, terms: v.allowed_terms, fee: v.fee_cents, version: v.version }))}
        sims={sims}
        preselected={sp.cliente ?? ""}
      />
    </>
  );
}
