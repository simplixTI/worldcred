import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageTitle, StatusBadge, Alert } from "@/components/ui";
import { ScheduleTable } from "@/components/schedule-table";
import { formatDateTimeBR } from "@/lib/finance/dates";
import type { ScheduleSnapshot } from "@/lib/finance/price";

export default async function PropostaDetalhe({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await createClient();
  const { data: p } = await db.from("proposals").select("*, customers(id, full_name), contracts(id, number, status)").eq("id", id).maybeSingle();
  if (!p) notFound();
  const snap = p.schedule_snapshot as ScheduleSnapshot;
  const contract = p.contracts as unknown as { id: string; number: string; status: string } | null;
  return (
    <>
      <PageTitle title={`Proposta #${p.number}`} subtitle={`${(p.customers as unknown as { full_name: string }).full_name} · enviada ${formatDateTimeBR(p.sent_at)}`} action={<StatusBadge status={p.status} />} />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="card p-4"><ScheduleTable snap={snap} /></div>
        <div className="space-y-3">
          <div className="card p-4 text-sm space-y-2">
            <div className="font-semibold text-navy">Linha do tempo</div>
            <Timeline label="Enviada" at={p.sent_at} />
            <Timeline label="Aceita pelo cliente" at={p.accepted_at} />
            <Timeline label={p.status === "declined" ? "Recusada" : "Aprovada"} at={p.decided_at} />
            {p.expires_at && p.status === "sent" && <p className="text-xs text-muted">Expira em {formatDateTimeBR(p.expires_at)}</p>}
            {p.decision_note && <Alert kind="info">{p.decision_note}</Alert>}
          </div>
          {contract && (
            <div className="card p-4 text-sm">
              <div className="font-semibold text-navy mb-1">Contrato</div>
              <Link href={`/agente/contratos/${contract.id}`} className="text-navy underline">{contract.number}</Link> <StatusBadge status={contract.status} />
            </div>
          )}
          <p className="text-xs text-muted">Aprovação de crédito e autorização do desembolso são feitas pelo perfil autorizado da empresa.</p>
        </div>
      </div>
    </>
  );
}

function Timeline({ label, at }: { label: string; at: string | null }) {
  return <div className="flex items-center justify-between"><span className={at ? "text-ink" : "text-muted"}>{label}</span><span className="text-xs text-muted">{at ? formatDateTimeBR(at) : "—"}</span></div>;
}
