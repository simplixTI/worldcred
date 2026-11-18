import { PageTitle, Alert, Money, StatusBadge, Empty } from "@/components/ui";
import { getSetting } from "@/lib/services/settings";
import { adminClient } from "@/lib/supabase/admin";
import { ActionButton } from "@/components/action-button";
import { toggleCardModality } from "../actions";

export default async function AdminCartao() {
  const card = await getSetting("card", { enabled: false, provider: null as string | null, integration_approved: false });
  const { data: ops } = await adminClient().from("card_operations").select("*, customers(full_name)").order("created_at", { ascending: false }).limit(50);
  return (
    <>
      <PageTitle title="Crédito via cartão" subtitle="Modalidade desativada por padrão. Ativação em produção exige integração oficial aprovada para converter crédito em dinheiro." />
      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <div className="card p-4 text-sm space-y-3">
          <div className="flex items-center justify-between"><span>Status da modalidade</span><StatusBadge status={card.enabled ? "active" : "cancelled"} overrideLabel={card.enabled ? "Ativa" : "Desativada"} /></div>
          <p className="text-muted">Provedor: {card.provider ?? "não configurado"} · Integração aprovada: {card.integration_approved ? "sim" : "não"}</p>
          <ActionButton label={card.enabled ? "Desativar modalidade" : "Ativar modalidade"} className={card.enabled ? "btn-danger" : "btn-green"} confirm={card.enabled ? undefined : "Ativar somente com integração oficial aprovada (checkout hospedado ou tokenização). Confirmar?"} action={toggleCardModality} args={[]} />
          <Alert kind="info">Regras: cartão completo e CVV nunca entram no sistema (checkout hospedado/tokenização do parceiro); desembolso Pix vinculado à liquidação do parceiro e protegido por referência única; quando a dívida é paga na fatura, não há parcelas Pix de cobrança.</Alert>
        </div>
        <div className="card overflow-x-auto">
          {!ops?.length ? <Empty>Nenhuma operação de cartão registrada.</Empty> : (
            <table className="table"><thead><tr><th>Cliente</th><th>Líquido via Pix</th><th>No cartão</th><th>Total</th><th>Tarifas</th><th>Autorização</th><th>Liquidação</th><th>Desembolso</th><th>Contestação</th></tr></thead>
              <tbody>{ops.map((o) => <tr key={o.id}><td>{(o.customers as unknown as { full_name: string }).full_name}</td><td><Money cents={o.net_pix_cents} /></td><td>{o.installments}x <Money cents={o.installment_cents} /></td><td><Money cents={o.gross_cents} /></td><td><Money cents={o.fees_cents} /></td><td>{o.authorization_status ?? "—"}</td><td>{o.settlement_status ?? "—"}</td><td>{o.disbursement_status ?? "—"}</td><td>{o.dispute_status ?? "—"}</td></tr>)}</tbody></table>
          )}
        </div>
      </div>
    </>
  );
}
