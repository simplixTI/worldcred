import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateCharge } from "@/lib/services/charges";
import { PageTitle, StatusBadge, Money, Alert } from "@/components/ui";
import { daysOverdue, formatDateBR, formatDateTimeBR } from "@/lib/finance/dates";
import { PayPanel } from "./pay-panel";

export default async function ParcelaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await createClient();
  const { data: i } = await db.from("installments").select("*, contracts(number), payment_claims(id, status, created_at)").eq("id", id).maybeSingle();
  if (!i) notFound();
  const { data: payments } = await db.from("payments").select("id, external_payment_id, amount_cents, applied_cents, kind, status, paid_at").eq("installment_id", id).order("paid_at");
  const open = i.status !== "paid" && i.status !== "cancelled";
  const balance = Number(i.amount_cents) - Number(i.paid_cents);
  const d = daysOverdue(i.due_date);
  const claimOpen = (i.payment_claims as { status: string }[]).some((c) => c.status === "open");
  let charge = null; let chargeError: string | null = null;
  if (open) { try { charge = await getOrCreateCharge(id); } catch (e) { chargeError = (e as Error).message; } }
  return (
    <>
      <PageTitle title={`Parcela ${i.number} · ${(i.contracts as unknown as { number: string }).number}`} subtitle={`Vencimento ${formatDateBR(i.due_date)}`} action={<StatusBadge status={i.status} />} />
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <div className="card p-4">
            <div className="text-sm text-muted">Valor em aberto</div>
            <div className="text-3xl font-bold text-navy"><Money cents={balance} /></div>
            {open && d > 0 && <div className="text-danger font-semibold text-sm mt-1">Vencida há {d} dia(s)</div>}
            {i.in_review && <div className="mt-2"><Alert kind="warn">Pagamento em conferência. Os lembretes estão pausados até a revisão.</Alert></div>}
          </div>
          {open ? (
            chargeError ? <Alert kind="danger">{chargeError}</Alert> : charge && <PayPanel installmentId={id} charge={{ reference: charge.reference, qr_data_url: charge.qr_data_url!, qr_payload: charge.qr_payload, expires_at: charge.expires_at, amount_cents: charge.amount_cents }} claimOpen={claimOpen} />
          ) : (
            <div className="card p-4"><h2 className="font-semibold text-navy mb-1">Recibo</h2><p className="text-sm">Parcela paga em {formatDateTimeBR(i.paid_at)}.</p></div>
          )}
        </div>
        <div className="card p-4 text-sm">
          <h2 className="font-semibold text-navy mb-2">Pagamentos registrados</h2>
          {!payments?.length ? <p className="text-muted">Nenhum pagamento identificado ainda.</p> : (
            <ul className="space-y-2">{payments.map((p) => (
              <li key={p.id} className="border-b border-line pb-2 last:border-0"><div className="flex justify-between"><Money cents={p.amount_cents} className="font-semibold" /><StatusBadge status={p.status} /></div><div className="text-xs text-muted">{formatDateTimeBR(p.paid_at)} · E2E {p.external_payment_id.slice(0, 14)}…</div></li>
            ))}</ul>
          )}
        </div>
      </div>
    </>
  );
}
