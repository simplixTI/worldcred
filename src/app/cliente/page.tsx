import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageTitle, StatusBadge, Money, Alert, Empty } from "@/components/ui";
import { daysOverdue, formatDateBR } from "@/lib/finance/dates";
import { getCardSettings } from "@/lib/services/card";

export default async function ClienteHome() {
  const s = await requireRole(["client"], { mfa: false });
  const db = await createClient();
  const [{ data: me }, { data: proposals }, { data: contracts }] = await Promise.all([
    db.from("customers").select("pix_key_status").maybeSingle(),
    db.from("proposals").select("id, number, status, principal_cents, term_months, expires_at").in("status", ["sent", "accepted", "approved", "contracted"]).order("created_at", { ascending: false }),
    db.from("contracts").select("id, number, status, principal_cents, installments(id, number, due_date, amount_cents, paid_cents, status, in_review)").order("created_at", { ascending: false }),
  ]);
  const cardLive = await getCardSettings().then((c) => c.live).catch(() => false);
  const pending = (proposals ?? []).filter((p) => p.status === "sent");
  const upcoming = (contracts ?? []).flatMap((c) => (c.installments as { id: string; number: number; due_date: string; amount_cents: number; paid_cents: number; status: string; in_review: boolean }[]).filter((i) => i.status !== "paid").map((i) => ({ ...i, contract: c.number }))).sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 6);
  return (
    <>
      <PageTitle title={`Olá, ${s.fullName.split(" ")[0]}`} />
      {me?.pix_key_status !== "validated" && <div className="mb-4"><Alert kind="warn">Cadastre e valide sua chave Pix para receber o crédito. <Link href="/cliente/pix" className="underline font-semibold">Cadastrar agora</Link></Alert></div>}
      {pending.map((p) => (
        <div key={p.id} className="card p-4 mb-4 border-green flex flex-wrap items-center justify-between gap-3">
          <div><div className="font-bold text-navy">Proposta #{p.number} aguarda sua leitura e aceite</div><div className="text-sm text-muted"><Money cents={p.principal_cents} /> em {p.term_months}x · válida até {formatDateBR(p.expires_at)}</div></div>
          <Link href={`/cliente/propostas/${p.id}`} className="btn-green">Ler e aceitar</Link>
        </div>
      ))}
      {!pending.length && <div className="card p-4 mb-4 border-green/40 flex flex-wrap items-center justify-between gap-3"><div><div className="font-bold text-navy">Precisa de crédito?</div><div className="text-sm text-muted">Escolha valor e prazo, depois decida entre prestações via Pix ou cartão de crédito.</div></div><Link href="/cliente/credito" className="btn-green">Pedir crédito</Link></div>}
      {cardLive && <div className="card p-4 mb-4 flex flex-wrap items-center justify-between gap-3"><div><div className="font-bold text-navy">Crédito com o cartão</div><div className="text-sm text-muted">Taxa menor: pague no cartão e receba o valor via Pix, sem cobrança mensal.</div></div><Link href="/cliente/cartao" className="btn-outline">Simular</Link></div>}
      <h2 className="font-semibold text-navy mb-2">Próximas parcelas</h2>
      {!upcoming.length ? <Empty>Nenhuma parcela em aberto.</Empty> : (
        <div className="grid gap-3 sm:grid-cols-2 mb-6">
          {upcoming.map((i) => { const d = daysOverdue(i.due_date); return (
            <Link key={i.id} href={`/cliente/parcelas/${i.id}`} className="card p-4 hover:border-green">
              <div className="flex items-center justify-between"><span className="text-sm text-muted">Parcela {i.number} · {i.contract}</span><StatusBadge status={i.status} /></div>
              <div className="text-xl font-bold text-navy mt-1"><Money cents={i.amount_cents - i.paid_cents} /></div>
              <div className={`text-sm ${d > 0 ? "text-danger font-semibold" : "text-muted"}`}>{d > 0 ? `Vencida há ${d} dia(s)` : d === 0 ? "Vence hoje" : `Vence em ${formatDateBR(i.due_date)}`}{i.in_review && " · em conferência"}</div>
              <div className="mt-2 text-sm font-semibold text-green">Pagar com Pix →</div>
            </Link>
          ); })}
        </div>
      )}
      <h2 className="font-semibold text-navy mb-2">Contratos</h2>
      {!contracts?.length ? <Empty>Você ainda não possui contratos.</Empty> : (
        <ul className="card divide-y divide-line">{contracts.map((c) => (
          <li key={c.id}><Link href={`/cliente/contratos/${c.id}`} className="flex items-center justify-between p-4 hover:bg-bg"><span><span className="font-semibold text-navy">{c.number}</span> · <Money cents={c.principal_cents} /></span><StatusBadge status={c.status} /></Link></li>
        ))}</ul>
      )}
    </>
  );
}
