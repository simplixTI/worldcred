import { createClient } from "@/lib/supabase/server";
import { PageTitle, StatusBadge, Empty, CASE_REASON } from "@/components/ui";
import { formatDateTimeBR } from "@/lib/finance/dates";
import { CaseButtons } from "./buttons";

export default async function AgenteCasos() {
  const db = await createClient();
  const { data } = await db.from("collection_cases").select("*, customers(full_name), installments(number, due_date)").neq("status", "resolved").order("created_at");
  return (
    <>
      <PageTitle title="Meus casos" subtitle="Casos de cobrança da sua carteira ou atribuídos a você." />
      {!data?.length ? <Empty>Nenhum caso em aberto.</Empty> : (
        <div className="card overflow-x-auto"><table className="table"><thead><tr><th>Cliente</th><th>Parcela</th><th>Motivo</th><th>Status</th><th>Aberto em</th><th></th></tr></thead>
          <tbody>{data.map((k) => (
            <tr key={k.id}><td>{(k.customers as unknown as { full_name: string })?.full_name}</td><td>{(k.installments as unknown as { number: number } | null)?.number ?? "—"}</td><td>{CASE_REASON[k.reason]}<div className="text-xs text-muted">{k.detail}</div></td><td><StatusBadge status={k.status} /></td><td className="text-muted">{formatDateTimeBR(k.created_at)}</td><td><CaseButtons id={k.id} status={k.status} /></td></tr>
          ))}</tbody></table></div>
      )}
    </>
  );
}
