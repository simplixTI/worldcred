import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageTitle, Money, Empty, StatusBadge } from "@/components/ui";
import { formatDateTimeBR } from "@/lib/finance/dates";

export default async function RecibosPage() {
  const db = await createClient();
  const { data } = await db.from("payments").select("id, amount_cents, applied_cents, status, kind, paid_at, external_payment_id, installments(id, number, contracts(number))").order("paid_at", { ascending: false });
  return (
    <>
      <PageTitle title="Recibos" subtitle="Pagamentos identificados pelo provedor Pix." />
      {!data?.length ? <Empty>Nenhum pagamento registrado.</Empty> : (
        <div className="card overflow-x-auto"><table className="table"><thead><tr><th>Data</th><th>Contrato</th><th>Parcela</th><th className="text-right">Valor</th><th>Status</th><th>Identificador</th></tr></thead>
          <tbody>{data.map((p) => { const inst = p.installments as unknown as { id: string; number: number; contracts: { number: string } } | null; return (
            <tr key={p.id}><td>{formatDateTimeBR(p.paid_at)}</td><td>{inst?.contracts?.number ?? "—"}</td><td>{inst ? <Link className="text-navy underline" href={`/cliente/parcelas/${inst.id}`}>{inst.number}</Link> : "—"}</td><td className="text-right"><Money cents={p.amount_cents} /></td><td><StatusBadge status={p.status} /></td><td className="font-mono text-xs">{p.external_payment_id}</td></tr>
          ); })}</tbody></table></div>
      )}
    </>
  );
}
