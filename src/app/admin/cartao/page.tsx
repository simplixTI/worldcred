import { PageTitle, Alert, Money, StatusBadge, Empty } from "@/components/ui";
import { getCardSettings } from "@/lib/services/card";
import { adminClient } from "@/lib/supabase/admin";
import { ActionButton } from "@/components/action-button";
import { toggleCardModality, disburseCard, syncCard } from "../actions";
import { formatDateTimeBR } from "@/lib/finance/dates";
import { maskPixKey } from "@/lib/utils/mask";

const LABEL: Record<string, string> = { draft: "Aguardando pagamento", authorized: "Cartão aprovado", settled: "Liberado pelo MP", disbursed: "Pix enviado", disputed: "Contestação", cancelled: "Cancelada" };

export default async function AdminCartao() {
  const cfg = await getCardSettings();
  const { data: ops } = await adminClient().from("card_operations").select("*, customers(full_name)").order("created_at", { ascending: false }).limit(50);
  return (
    <>
      <PageTitle title="Crédito via cartão" subtitle="Checkout hospedado do Mercado Pago. O cliente paga no cartão; após aprovação, o admin libera o Pix líquido. Sem parcelas Pix: a dívida fica na fatura." />
      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <div className="card p-4 text-sm space-y-3">
          <div className="flex items-center justify-between"><span>Modalidade</span><StatusBadge status={cfg.live ? "active" : "cancelled"} overrideLabel={cfg.live ? "Ativa" : cfg.enabled ? "Ativa, sem credencial MP" : "Desativada"} /></div>
          <p className="text-muted">Provedor: Mercado Pago · token {process.env.MP_ACCESS_TOKEN ? (process.env.MP_ACCESS_TOKEN.startsWith("TEST-") ? "de teste" : "de produção") : "ausente"} · webhook {process.env.MP_WEBHOOK_SECRET ? "assinado" : "sem segredo"}</p>
          <p className="text-muted">Taxa {Number(cfg.monthly_rate) * 100}% a.m. · até {cfg.max_installments}x · liberar antes do repasse: {cfg.allow_disburse_before_release ? "sim (teste)" : "não"}</p>
          <ActionButton label={cfg.enabled ? "Desativar modalidade" : "Ativar modalidade"} className={cfg.enabled ? "btn-danger" : "btn-green"} action={toggleCardModality} args={[]} />
          <Alert kind="info">Webhook: <code>{process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/mercadopago</code>. Configure no painel do Mercado Pago (evento “Pagamentos”) e copie a assinatura secreta para MP_WEBHOOK_SECRET.</Alert>
        </div>
        <div className="card overflow-x-auto">
          {!ops?.length ? <Empty>Nenhuma operação de cartão registrada.</Empty> : (
            <table className="table"><thead><tr><th>Quando</th><th>Cliente</th><th>Líquido via Pix</th><th>No cartão</th><th>Total</th><th>Custo</th><th>Situação</th><th>Repasse MP</th><th></th></tr></thead>
              <tbody>{ops.map((o) => <tr key={o.id}><td className="text-xs text-muted">{formatDateTimeBR(o.created_at)}</td><td>{(o.customers as unknown as { full_name: string }).full_name}<div className="text-xs text-muted font-mono">{maskPixKey(o.pix_key)}</div></td><td><Money cents={o.net_pix_cents} /></td><td>{o.installments}x <Money cents={o.installment_cents} /></td><td><Money cents={o.gross_cents} /></td><td><Money cents={o.fees_cents} /></td>
                <td><StatusBadge status={o.status} overrideLabel={LABEL[o.status] ?? o.status} />{o.authorization_status && o.authorization_status !== "approved" && <div className="text-xs text-warn">{o.authorization_status}</div>}{o.disbursement_status && <div className="text-xs text-muted">pix: {o.disbursement_status}</div>}</td>
                <td className="text-xs">{o.release_at ? formatDateTimeBR(o.release_at) : "—"}</td>
                <td><div className="flex flex-col gap-1">
                  {["authorized", "settled"].includes(o.status) && <ActionButton label="Liberar Pix" className="btn-green !py-1.5 !px-3 text-xs" confirm={`Enviar ${(Number(o.net_pix_cents) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} via Pix para a chave do cliente?`} action={disburseCard} args={[o.id]} />}
                  {o.provider_payment_id && o.status !== "disbursed" && <ActionButton label="Reconsultar MP" action={syncCard} args={[o.provider_payment_id]} />}
                </div></td></tr>)}</tbody></table>
          )}
        </div>
      </div>
    </>
  );
}
