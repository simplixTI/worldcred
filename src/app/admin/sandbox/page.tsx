import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { adminClient } from "@/lib/supabase/admin";
import { PageTitle, Alert, Money, StatusBadge, Empty } from "@/components/ui";
import { ActionButton } from "@/components/action-button";
import { simPay, simExpire, simRefund, simBadSignature, simPayoutWebhook, simResend, runCollections, runReconcile } from "../actions";
import { formatDateTimeBR } from "@/lib/finance/dates";

export default async function Sandbox() {
  if (!env.isSandbox) notFound();
  const db = adminClient();
  const [{ data: charges }, { data: payouts }, { data: events }] = await Promise.all([
    db.from("pix_charges").select("*, installments(number, amount_cents, paid_cents, status, contracts(number, customers(full_name)))").order("created_at", { ascending: false }).limit(30),
    db.from("disbursements").select("*, contracts(number)").in("status", ["sent", "timeout", "failed", "authorized"]).order("created_at", { ascending: false }).limit(20),
    db.from("provider_events").select("*").eq("kind", "charge.paid").eq("signature_valid", true).order("received_at", { ascending: false }).limit(10),
  ]);
  return (
    <>
      <PageTitle title="Simulador do provedor Pix (sandbox)" subtitle="Dispara eventos assinados contra o webhook real da aplicação. Disponível apenas com PIX_PROVIDER=mock." action={<div className="flex gap-2"><ActionButton label="Rodar régua" onRun={() => runCollections()} /><ActionButton label="Rodar conciliação" onRun={() => runReconcile()} /></div>} />
      <Alert kind="info">Gatilhos: chave Pix com “timeout” → tempo limite no desembolso (consulta posterior confirma); “falha” → desembolso recusado; “invalida” → chave rejeitada. Telefone terminado em 0000 → SMS falha.</Alert>
      <h2 className="font-semibold text-navy mt-4 mb-2">Cobranças</h2>
      {!charges?.length ? <Empty>Nenhuma cobrança emitida. Abra uma parcela no portal do cliente para gerar o QR.</Empty> : (
        <div className="card overflow-x-auto mb-6"><table className="table"><thead><tr><th>Referência</th><th>Cliente / parcela</th><th>Valor</th><th>Status</th><th>Expira</th><th>Ações</th></tr></thead>
          <tbody>{charges.map((c) => { const i = c.installments as unknown as { number: number; amount_cents: number; paid_cents: number; status: string; contracts: { number: string; customers: { full_name: string } } }; const bal = i.amount_cents - i.paid_cents; return (
            <tr key={c.id}><td className="font-mono text-xs">{c.reference}</td><td>{i.contracts.customers.full_name}<div className="text-xs text-muted">{i.contracts.number} · {i.number}ª <StatusBadge status={i.status} /></div></td><td><Money cents={c.amount_cents} /></td><td><StatusBadge status={c.status} /></td><td className="text-xs">{formatDateTimeBR(c.expires_at)}</td>
              <td><div className="flex flex-wrap gap-1">
                <ActionButton label="Pagar integral" className="btn-green !py-1 !px-2 text-xs" onRun={() => simPay(c.reference)} />
                <ActionButton label="Pagar parcial (50%)" onRun={() => simPay(c.reference, Math.floor(bal / 2))} />
                <ActionButton label="Pagar a maior (+R$ 10)" onRun={() => simPay(c.reference, bal + 1000)} />
                <ActionButton label="Pagar de novo (duplicado)" onRun={() => simPay(c.reference)} />
                <ActionButton label="Conta recebedora errada" onRun={() => simPay(c.reference, undefined, "OUTRA-CONTA")} />
                <ActionButton label="Expirar QR" onRun={() => simExpire(c.reference)} />
                <ActionButton label="Assinatura inválida" className="btn-danger !py-1 !px-2 text-xs" onRun={() => simBadSignature(c.reference)} />
              </div></td></tr>
          ); })}</tbody></table></div>
      )}
      <h2 className="font-semibold text-navy mb-2">Eventos pagos recentes (reenviar / estornar)</h2>
      {!events?.length ? <Empty>—</Empty> : (
        <div className="card overflow-x-auto mb-6"><table className="table"><thead><tr><th>Evento</th><th>Referência</th><th>Resultado</th><th>Ações</th></tr></thead>
          <tbody>{events.map((e) => { const p = e.payload as { endToEndId?: string; amountCents?: number; eventId?: string }; return (
            <tr key={e.id}><td className="font-mono text-xs">{e.external_id}</td><td className="font-mono text-xs">{e.reference}</td><td className="font-mono text-xs">{JSON.stringify(e.result)}</td>
              <td><div className="flex gap-1 flex-wrap"><ActionButton label="Reenviar webhook (duplicado)" onRun={() => simResend(JSON.stringify(e.payload))} />{p.endToEndId && <ActionButton label="Estorno total" className="btn-danger !py-1 !px-2 text-xs" onRun={() => simRefund(p.endToEndId!, Number(p.amountCents))} />}</div></td></tr>
          ); })}</tbody></table></div>
      )}
      <h2 className="font-semibold text-navy mb-2">Desembolsos pendentes/ambíguos</h2>
      {!payouts?.length ? <Empty>—</Empty> : (
        <div className="card overflow-x-auto"><table className="table"><thead><tr><th>Contrato</th><th>Referência</th><th>Status</th><th>Erro</th><th></th></tr></thead>
          <tbody>{payouts.map((d) => <tr key={d.id}><td>{(d.contracts as unknown as { number: string }).number}</td><td className="font-mono text-xs">{d.reference}</td><td><StatusBadge status={d.status} /></td><td className="text-xs text-danger">{d.last_error}</td><td><ActionButton label="Enviar webhook de payout" onRun={() => simPayoutWebhook(d.reference)} /></td></tr>)}</tbody></table></div>
      )}
    </>
  );
}
