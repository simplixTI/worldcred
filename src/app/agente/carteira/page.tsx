import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageTitle, StatusBadge, Money, Empty } from "@/components/ui";
import { maskCPF } from "@/lib/utils/mask";
import { daysOverdue, formatDateBR } from "@/lib/finance/dates";

export default async function CarteiraPage() {
  const db = await createClient();
  const { data: customers } = await db.from("customers").select("id, full_name, cpf, pix_key_status, user_id").order("full_name");
  const { data: contracts } = await db.from("contracts").select("id, number, status, principal_cents, customers(full_name), installments(id, number, due_date, amount_cents, paid_cents, status)").order("created_at", { ascending: false });
  return (
    <>
      <PageTitle title="Minha carteira" subtitle="Somente clientes e contratos vinculados a você." />
      <h2 className="font-semibold text-navy mb-2">Clientes</h2>
      {!customers?.length ? <Empty>Nenhum cliente na carteira.</Empty> : (
        <div className="card overflow-x-auto mb-6"><table className="table"><thead><tr><th>Nome</th><th>CPF</th><th>Acesso</th><th>Chave Pix</th></tr></thead>
          <tbody>{customers.map((c) => (
            <tr key={c.id}><td><Link className="text-navy underline" href={`/agente/clientes/${c.id}`}>{c.full_name}</Link></td><td className="font-mono text-xs">{maskCPF(c.cpf)}</td><td>{c.user_id ? "Sim" : "Pendente"}</td><td><StatusBadge status={c.pix_key_status} /></td></tr>
          ))}</tbody></table></div>
      )}
      <h2 className="font-semibold text-navy mb-2">Contratos</h2>
      {!contracts?.length ? <Empty>Nenhum contrato.</Empty> : (
        <div className="card overflow-x-auto"><table className="table"><thead><tr><th>Contrato</th><th>Cliente</th><th>Principal</th><th>Status</th><th>Próxima parcela</th><th>Em atraso</th></tr></thead>
          <tbody>{contracts.map((k) => {
            const open = (k.installments as { number: number; due_date: string; amount_cents: number; paid_cents: number; status: string }[]).filter((i) => i.status !== "paid").sort((a, b) => a.due_date.localeCompare(b.due_date));
            const next = open[0];
            const overdue = open.filter((i) => daysOverdue(i.due_date) > 0);
            return (
              <tr key={k.id}><td><Link className="text-navy underline" href={`/agente/contratos/${k.id}`}>{k.number}</Link></td><td>{(k.customers as unknown as { full_name: string })?.full_name}</td><td><Money cents={k.principal_cents} /></td><td><StatusBadge status={k.status} /></td>
                <td>{next ? <>{next.number}ª · {formatDateBR(next.due_date)} · <Money cents={next.amount_cents - next.paid_cents} /></> : "—"}</td>
                <td>{overdue.length ? <span className="text-danger font-semibold">{overdue.length} ({daysOverdue(overdue[0].due_date)} dias)</span> : "—"}</td></tr>
            );
          })}</tbody></table></div>
      )}
    </>
  );
}
