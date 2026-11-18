import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageTitle, StatusBadge, Money, Alert } from "@/components/ui";
import { maskCPF, maskPhone, maskPixKey } from "@/lib/utils/mask";
import { formatDateTimeBR } from "@/lib/finance/dates";
import { InviteButton } from "./invite-button";

export default async function ClienteDetalhe({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await createClient();
  const { data: c } = await db.from("customers").select("*").eq("id", id).maybeSingle();
  if (!c) notFound();
  const { data: proposals } = await db.from("proposals").select("id, number, status, principal_cents, term_months, created_at").eq("customer_id", id).order("created_at", { ascending: false });
  const { data: contracts } = await db.from("contracts").select("id, number, status, principal_cents").eq("customer_id", id).order("created_at", { ascending: false });
  return (
    <>
      <PageTitle title={c.full_name} subtitle={`CPF ${maskCPF(c.cpf)} · ${maskPhone(c.phone)}`}
        action={<Link href={`/agente/propostas/nova?cliente=${c.id}`} className="btn-green">Nova proposta</Link>} />
      <div className="grid gap-4 md:grid-cols-3">
        <div className="card p-4 space-y-2 text-sm">
          <div className="font-semibold text-navy">Acesso ao portal</div>
          {c.user_id ? <Alert kind="success">Cliente já criou o acesso.</Alert> : (
            <>
              <Alert kind="warn">Cliente ainda não criou o acesso.</Alert>
              <InviteButton customerId={c.id} />
            </>
          )}
          <div className="pt-2 border-t border-line">
            <div className="font-semibold text-navy mb-1">Chave Pix para desembolso</div>
            <div className="flex items-center gap-2"><StatusBadge status={c.pix_key_status} /> <span className="font-mono text-xs">{maskPixKey(c.pix_key)}</span></div>
            <p className="text-xs text-muted mt-1">A chave é cadastrada pelo próprio cliente no portal e validada pelo parceiro Pix.</p>
          </div>
        </div>
        <div className="card p-4 md:col-span-2">
          <div className="font-semibold text-navy mb-2">Propostas</div>
          {!proposals?.length ? <p className="text-sm text-muted">Nenhuma proposta ainda.</p> : (
            <table className="table"><thead><tr><th>Nº</th><th>Valor</th><th>Prazo</th><th>Status</th><th>Criada</th></tr></thead>
              <tbody>{proposals.map((p) => (
                <tr key={p.id}><td><Link className="text-navy underline" href={`/agente/propostas/${p.id}`}>#{p.number}</Link></td><td><Money cents={p.principal_cents} /></td><td>{p.term_months}x</td><td><StatusBadge status={p.status} /></td><td className="text-muted">{formatDateTimeBR(p.created_at)}</td></tr>
              ))}</tbody></table>
          )}
          <div className="font-semibold text-navy mt-4 mb-2">Contratos</div>
          {!contracts?.length ? <p className="text-sm text-muted">Nenhum contrato.</p> : (
            <ul className="text-sm space-y-1">{contracts.map((k) => <li key={k.id} className="flex items-center gap-2"><Link className="text-navy underline" href={`/agente/contratos/${k.id}`}>{k.number}</Link> <Money cents={k.principal_cents} /> <StatusBadge status={k.status} /></li>)}</ul>
          )}
        </div>
      </div>
    </>
  );
}
