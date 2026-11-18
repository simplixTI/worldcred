import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageTitle, StatusBadge, Money, Empty } from "@/components/ui";
import { formatDateTimeBR } from "@/lib/finance/dates";

export default async function PropostasPage() {
  const db = await createClient();
  const { data } = await db.from("proposals").select("id, number, status, principal_cents, term_months, created_at, customers(full_name)").order("created_at", { ascending: false }).limit(100);
  return (
    <>
      <PageTitle title="Minhas propostas" action={<Link href="/agente/propostas/nova" className="btn-green">Nova proposta</Link>} />
      {!data?.length ? <Empty>Você ainda não enviou propostas.</Empty> : (
        <div className="card overflow-x-auto"><table className="table"><thead><tr><th>Nº</th><th>Cliente</th><th>Valor</th><th>Prazo</th><th>Status</th><th>Criada</th></tr></thead>
          <tbody>{data.map((p) => (
            <tr key={p.id}><td><Link className="text-navy underline" href={`/agente/propostas/${p.id}`}>#{p.number}</Link></td><td>{(p.customers as unknown as { full_name: string })?.full_name}</td><td><Money cents={p.principal_cents} /></td><td>{p.term_months}x</td><td><StatusBadge status={p.status} /></td><td className="text-muted">{formatDateTimeBR(p.created_at)}</td></tr>
          ))}</tbody></table></div>
      )}
    </>
  );
}
