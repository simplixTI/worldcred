import { adminClient } from "@/lib/supabase/admin";
import { PageTitle, StatusBadge, Money, Empty, Alert } from "@/components/ui";
import { formatDateTimeBR } from "@/lib/finance/dates";
import { maskPixKey } from "@/lib/utils/mask";
import { ActionButton } from "@/components/action-button";
import { authorizeDisbursement, consultDisbursement, retryDisbursement, runReconcile } from "../actions";

export default async function AdminDesembolsos() {
  const db = adminClient();
  const { data } = await db.from("disbursements").select("*, contracts(id, number, status, customers(full_name, pix_key_status))").order("created_at", { ascending: false }).limit(100);
  const pending = (data ?? []).filter((d) => ["pending", "authorized", "sent", "timeout", "failed"].includes(d.status));
  const done = (data ?? []).filter((d) => d.status === "confirmed");
  return (
    <>
      <PageTitle title="Autorização de desembolso" subtitle="Exige MFA. A liberação requer chave Pix validada e usa referência única por envio." action={<ActionButton label="Consultar pendentes no provedor" onRun={() => runReconcile()} />} />
      <Alert kind="info">Em caso de tempo limite ou resposta ambígua, o sistema não reenvia: consulta o provedor pela referência antes de qualquer nova tentativa.</Alert>
      <div className="mt-4">
      {!pending.length ? <Empty>Nenhum desembolso pendente.</Empty> : (
        <div className="card overflow-x-auto mb-6"><table className="table"><thead><tr><th>Contrato</th><th>Cliente</th><th>Valor líquido</th><th>Chave</th><th>Status</th><th>Referência</th><th></th></tr></thead>
          <tbody>{pending.map((d) => { const c = d.contracts as unknown as { id: string; number: string; status: string; customers: { full_name: string; pix_key_status: string } }; return (
            <tr key={d.id}><td>{c.number}</td><td>{c.customers.full_name}</td><td><Money cents={d.amount_cents} /></td><td><span className="font-mono text-xs">{maskPixKey(d.pix_key)}</span> <StatusBadge status={c.customers.pix_key_status} /></td>
              <td><StatusBadge status={d.status} />{d.last_error && <div className="text-xs text-danger">{d.last_error}</div>}<div className="text-xs text-muted">{d.attempts} tentativa(s)</div></td><td className="font-mono text-xs">{d.reference}</td>
              <td><div className="flex flex-col gap-1">
                {d.status === "pending" && <ActionButton label="Autorizar e enviar Pix" className="btn-green !py-1.5 !px-3 text-xs" confirm={`Autorizar o envio de ${(Number(d.amount_cents) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} para a chave do cliente?`} onRun={() => authorizeDisbursement(d.id)} />}
                {["authorized"].includes(d.status) && <ActionButton label="Enviar Pix" className="btn-green !py-1.5 !px-3 text-xs" onRun={() => authorizeDisbursement(d.id)} />}
                {["sent", "timeout"].includes(d.status) && <ActionButton label="Consultar status" onRun={() => consultDisbursement(d.id)} />}
                {d.status === "failed" && <ActionButton label="Nova tentativa (nova referência)" onRun={() => retryDisbursement(c.id)} confirm="Gerar nova referência e reenviar? O sistema confirma antes que a anterior não foi liquidada." />}
              </div></td></tr>
          ); })}</tbody></table></div>
      )}
      </div>
      <h2 className="font-semibold text-navy mb-2">Confirmados</h2>
      {!done.length ? <Empty>—</Empty> : (
        <div className="card overflow-x-auto"><table className="table"><thead><tr><th>Contrato</th><th>Cliente</th><th>Valor</th><th>Confirmado</th><th>Tx provedor</th></tr></thead>
          <tbody>{done.map((d) => { const c = d.contracts as unknown as { number: string; customers: { full_name: string } }; return <tr key={d.id}><td>{c.number}</td><td>{c.customers.full_name}</td><td><Money cents={d.amount_cents} /></td><td>{formatDateTimeBR(d.confirmed_at)}</td><td className="font-mono text-xs">{d.provider_tx_id}</td></tr>; })}</tbody></table></div>
      )}
    </>
  );
}
