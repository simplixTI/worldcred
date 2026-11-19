import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageTitle, StatusBadge, Alert } from "@/components/ui";
import { ScheduleTable } from "@/components/schedule-table";
import { AcceptForm } from "./accept-form";
import type { ScheduleSnapshot } from "@/lib/finance/price";
import { formatBRL, formatRate } from "@/lib/finance/money";
import { formatDateTimeBR } from "@/lib/finance/dates";

export default async function ClienteProposta({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aceita?: string; nova?: string }> }) {
  const { id } = await params; const sp = await searchParams;
  const db = await createClient();
  const { data: p } = await db.from("proposals").select("*, lenders(legal_name, cnpj), customers(full_name)").eq("id", id).maybeSingle();
  if (!p) notFound();
  const snap = p.schedule_snapshot as ScheduleSnapshot;
  const lender = p.lenders as unknown as { legal_name: string; cnpj: string };
  const termsText = buildTerms(snap, lender, (p.customers as unknown as { full_name: string }).full_name);
  return (
    <>
      <PageTitle title={`Proposta #${p.number}`} subtitle={`Credor: ${lender.legal_name} · CNPJ ${lender.cnpj}`} action={<StatusBadge status={p.status} />} />
      {sp.nova && p.status === "sent" && <div className="mb-4"><Alert kind="success">Sua conta foi criada e esta é a sua proposta. Leia as condições e, se estiver de acordo, aceite abaixo. Depois cadastre sua chave Pix para receber o crédito.</Alert></div>}
      {sp.aceita && <div className="mb-4"><Alert kind="success">Aceite registrado em {formatDateTimeBR(p.accepted_at)}. Agora a proposta segue para aprovação e, depois, o crédito é enviado para sua chave Pix.</Alert></div>}
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="card p-4"><ScheduleTable snap={snap} /></div>
        <div className="space-y-3">
          <div className="card p-4 text-sm">
            <h2 className="font-semibold text-navy mb-2">Resumo das condições</h2>
            <pre className="whitespace-pre-wrap font-sans text-xs text-ink bg-bg rounded-lg p-3 max-h-64 overflow-auto">{termsText}</pre>
          </div>
          {p.status === "sent" ? <div className="card p-4"><AcceptForm proposalId={p.id} termsText={termsText} /></div>
            : <Alert kind="info">Esta proposta não está mais disponível para aceite.</Alert>}
        </div>
      </div>
    </>
  );
}

function buildTerms(s: ScheduleSnapshot, lender: { legal_name: string; cnpj: string }, name: string) {
  return [
    `CONDIÇÕES DA OPERAÇÃO DE CRÉDITO (versão ${s.conditions_version})`,
    `Credor: ${lender.legal_name}, CNPJ ${lender.cnpj}.`,
    `Tomador: ${name}.`,
    `Valor do crédito: ${formatBRL(s.principal_cents)}. Valor líquido a receber via Pix: ${formatBRL(s.net_cents)}.`,
    `Tarifas: ${s.fee_cents ? formatBRL(s.fee_cents) : "não há"}. IOF: ${s.iof_cents ? formatBRL(s.iof_cents) : "não aplicável nesta operação"}.`,
    `Pagamento em ${s.term_months} parcelas mensais de ${formatBRL(s.regular_installment_cents)}${s.last_installment_adjustment_cents ? `, sendo a última de ${formatBRL(s.last_installment_cents)}` : ""}, total ${formatBRL(s.total_cents)}.`,
    `Taxa de juros: ${formatRate(s.monthly_rate)} ao mês (${formatRate(s.annual_rate)} ao ano). Custo Efetivo Total (CET): ${formatRate(s.cet_monthly)} ao mês (${formatRate(s.cet_annual)} ao ano).`,
    `Sistema de amortização: Tabela Price, parcelas fixas, arredondamento para centavos com ajuste na última parcela.`,
    `Vencimentos: a 1ª parcela vence 30 dias após a confirmação do desembolso e as demais mensalmente, no horário de Brasília.`,
    `Pagamento das parcelas: Pix (QR Code / copia e cola) gerado na conta recebedora do credor. Em atraso, lembretes por SMS e tratamento de cobrança.`,
    `Estas condições ficam congeladas após o aceite; alterações posteriores no catálogo não afetam este contrato.`,
  ].join("\n");
}
