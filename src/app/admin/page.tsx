import Link from "next/link";
import { adminClient, rpc } from "@/lib/supabase/admin";
import { PageTitle, Money, StatusBadge, Empty } from "@/components/ui";
import { Stagger, Item } from "@/components/motion";
import { ReceivablesBar, CashPair, AutomationStat } from "@/components/dashboard";
import { todaySP, formatDateBR, daysOverdue } from "@/lib/finance/dates";
import { addDays, format, startOfMonth } from "date-fns";
import { FileCheck2, Banknote, Inbox, Scale, AlertTriangle, ArrowRight } from "lucide-react";

type Filters = { de?: string; ate?: string; produto?: string; agente?: string; lista?: string };

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<Filters> }) {
  const sp = await searchParams;
  const today = todaySP();
  const from = sp.de || format(startOfMonth(new Date(today + "T12:00:00")), "yyyy-MM-dd");
  const to = sp.ate || today;
  const db = adminClient();
  const [m, { data: products }, { data: agents }, pend] = await Promise.all([
    rpc<Record<string, number | string>>("wc_dashboard", { p_from: from, p_to: to, p_product: sp.produto || null, p_agent: sp.agente || null }),
    db.from("products").select("id, name").order("principal_cents"),
    db.from("profiles").select("id, full_name").eq("role", "agent").order("full_name"),
    Promise.all([
      db.from("proposals").select("id", { count: "exact", head: true }).eq("status", "accepted"),
      db.from("disbursements").select("id", { count: "exact", head: true }).in("status", ["pending", "authorized", "sent", "timeout", "failed"]),
      db.from("leads").select("id", { count: "exact", head: true }).eq("status", "new"),
      db.from("reconciliation_items").select("id", { count: "exact", head: true }).eq("status", "open"),
    ]).then(([a, b, c, d]) => ({ approvals: a.count ?? 0, disbursements: b.count ?? 0, leads: c.count ?? 0, reconciliation: d.count ?? 0 })),
  ]);
  const n = (k: string) => Number(m[k] ?? 0);
  const q = (lista: string) => `/admin?${new URLSearchParams({ ...sp, lista }).toString()}`;
  const list = sp.lista ? await listFor(sp.lista, from, to, sp, today) : null;
  const d7 = n("due_7_cents"), d15 = n("due_15_cents"), d30 = n("due_30_cents"), open = n("open_to_fall_due_cents");
  const segments = [
    { key: "vencido", label: "Vencido", cents: n("overdue_cents"), href: q("vencido"), tone: "danger" as const },
    { key: "d7", label: "Até 7 dias", cents: d7, href: q("d7"), tone: "green" as const },
    { key: "d15", label: "8 a 15 dias", cents: Math.max(d15 - d7, 0), href: q("d15"), tone: "navy" as const },
    { key: "d30", label: "16 a 30 dias", cents: Math.max(d30 - d15, 0), href: q("d30"), tone: "muted" as const },
    { key: "depois", label: "+30 dias", cents: Math.max(open - d30, 0), href: q("avencer"), tone: "soft" as const },
  ];
  const queues = [
    { href: "/admin/propostas", label: "Aprovações pendentes", count: pend.approvals, Icon: FileCheck2 },
    { href: "/admin/desembolsos", label: "Desembolsos a liberar", count: pend.disbursements, Icon: Banknote },
    { href: "/admin/leads", label: "Leads sem agente", count: pend.leads, Icon: Inbox },
    { href: "/admin/conciliacao", label: "Itens em conciliação", count: pend.reconciliation, Icon: Scale },
    { href: "/admin/cobranca", label: "Casos de cobrança abertos", count: n("open_cases"), Icon: AlertTriangle },
  ];

  return (
    <>
      <PageTitle title="Painel" subtitle={`Hoje ${formatDateBR(today)} · horário de Brasília`} action={
        <form className="flex flex-wrap items-end gap-2 text-sm">
          <label className="flex items-center gap-1.5 rounded-xl border border-line bg-surface px-2.5 py-1.5"><span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">De</span><input type="date" name="de" defaultValue={from} className="bg-transparent outline-none text-sm" /></label>
          <label className="flex items-center gap-1.5 rounded-xl border border-line bg-surface px-2.5 py-1.5"><span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Até</span><input type="date" name="ate" defaultValue={to} className="bg-transparent outline-none text-sm" /></label>
          <select name="produto" defaultValue={sp.produto ?? ""} className="rounded-xl border border-line bg-surface px-2.5 py-2 text-sm"><option value="">Todos os produtos</option>{products?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <select name="agente" defaultValue={sp.agente ?? ""} className="rounded-xl border border-line bg-surface px-2.5 py-2 text-sm"><option value="">Todos os agentes</option>{agents?.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}</select>
          <button className="btn-primary !py-2">Aplicar</button>
        </form>
      } />

      <Stagger className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Item>
          <section className="brand-mesh text-white rounded-2xl p-6 md:p-7 relative overflow-hidden h-full">
            <div aria-hidden className="absolute -right-24 -top-24 w-72 h-72 rounded-full bg-green-bright/20 blur-3xl" />
            <div className="relative">
              <h2 className="text-sm font-semibold text-white/80 mb-4">Caixa do período <span className="text-white/50 font-normal">· {formatDateBR(from)} a {formatDateBR(to)}</span></h2>
              <CashPair outCents={n("disbursed_cents")} inCents={n("received_cents")} outHref={q("desembolsado")} inHref={q("recebido")} />
            </div>
          </section>
        </Item>
        <Item>
          <section className="card p-6 h-full">
            <AutomationStat autoCents={n("auto_settled_cents")} autoCount={n("auto_settled_count")} human={n("human_interventions")} />
            <p className="text-xs text-muted mt-4 leading-relaxed">Baixas confirmadas pelo provedor sem ninguém tocar, contra conciliações e casos que exigiram uma pessoa.</p>
          </section>
        </Item>
      </Stagger>

      <Stagger className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]" delay={0.15}>
        <Item>
          <section className="card p-6">
            <div className="flex items-baseline justify-between gap-3 mb-5">
              <h2 className="font-bold text-navy text-lg">Carteira a receber</h2>
              <span className="text-sm text-muted">em aberto <b className="text-navy tabular-nums"><Money cents={open + n("overdue_cents")} /></b></span>
            </div>
            <ReceivablesBar segments={segments} />
            <p className="text-xs text-muted mt-4">As faixas incluem o dia de hoje e consideram só o saldo ainda não pago. “Vencido” é tudo que passou do vencimento.</p>
          </section>
        </Item>
        <Item>
          <section className="card p-2 h-full">
            <h2 className="font-bold text-navy text-lg px-4 pt-4 pb-2">Precisa de você</h2>
            <ul>
              {queues.map((x) => (
                <li key={x.href}>
                  <Link href={x.href} className="group flex items-center gap-3 rounded-xl px-4 py-3 transition-colors hover:bg-bg">
                    <span className={`grid place-items-center w-9 h-9 rounded-xl ${x.count > 0 ? "bg-warn-soft text-warn" : "bg-bg text-muted"}`}><x.Icon size={17} /></span>
                    <span className="flex-1 text-sm font-medium text-ink">{x.label}</span>
                    <span className={`text-lg font-extrabold tabular-nums ${x.count > 0 ? "text-navy" : "text-muted"}`}>{x.count}</span>
                    <ArrowRight size={16} className="text-muted transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </Item>
      </Stagger>

      {list && (
        <section className="mt-6">
          <div className="flex items-center justify-between mb-2"><h2 className="font-bold text-navy text-lg">{list.title}</h2><Link href={`/admin?${new URLSearchParams({ de: from, ate: to, produto: sp.produto ?? "", agente: sp.agente ?? "" })}`} className="btn-outline !py-1.5 !px-3 text-xs">Fechar lista</Link></div>
          {!list.rows.length ? <Empty>Sem itens nesta faixa.</Empty> : (
            <div className="card overflow-x-auto"><table className="table"><thead><tr>{list.cols.map((c) => <th key={c}>{c}</th>)}</tr></thead><tbody>{list.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody></table></div>
          )}
        </section>
      )}
    </>
  );
}

async function listFor(kind: string, from: string, to: string, sp: Filters, today: string) {
  const db = adminClient();
  if (kind === "desembolsado") {
    const { data } = await db.from("disbursements").select("amount_cents, confirmed_at, reference, contracts!inner(number, agent_id, product_version_id, customers(full_name), product_versions!inner(product_id))").eq("status", "confirmed").gte("confirmed_at", `${from}T00:00:00-03:00`).lte("confirmed_at", `${to}T23:59:59-03:00`);
    const rows = (data ?? []).filter((d) => filt(d.contracts as never, sp)).map((d) => { const c = d.contracts as unknown as { number: string; customers: { full_name: string } }; return [formatDateBR(d.confirmed_at), c.number, c.customers.full_name, <Money key="m" cents={d.amount_cents} />, d.reference]; });
    return { title: "Desembolsos confirmados no período", cols: ["Data", "Contrato", "Cliente", "Valor", "Referência"], rows };
  }
  if (kind === "recebido") {
    const { data } = await db.from("payments").select("applied_cents, amount_cents, paid_at, kind, created_by, installments!inner(number, contracts!inner(number, agent_id, customers(full_name), product_versions!inner(product_id)))").eq("status", "applied").gte("paid_at", `${from}T00:00:00-03:00`).lte("paid_at", `${to}T23:59:59-03:00`);
    const rows = (data ?? []).filter((p) => filt((p.installments as unknown as { contracts: never }).contracts, sp)).map((p) => { const i = p.installments as unknown as { number: number; contracts: { number: string; customers: { full_name: string } } }; return [formatDateBR(p.paid_at), i.contracts.number, i.contracts.customers.full_name, `${i.number}ª`, <Money key="m" cents={p.applied_cents} />, p.created_by ? "manual" : "automática"]; });
    return { title: "Recebimentos no período", cols: ["Data", "Contrato", "Cliente", "Parcela", "Aplicado", "Baixa"], rows };
  }
  const t = new Date(today + "T12:00:00");
  const ranges: Record<string, [string | null, string | null, string]> = {
    avencer: [today, null, "Saldo aberto a vencer"], vencido: [null, format(addDays(t, -1), "yyyy-MM-dd"), "Parcelas vencidas"],
    d7: [today, format(addDays(t, 6), "yyyy-MM-dd"), "A receber em 7 dias"], d15: [today, format(addDays(t, 14), "yyyy-MM-dd"), "A receber em 15 dias"], d30: [today, format(addDays(t, 29), "yyyy-MM-dd"), "A receber em 30 dias"],
  };
  const r = ranges[kind]; if (!r) return null;
  let qb = db.from("installments").select("id, number, due_date, amount_cents, paid_cents, status, contracts!inner(number, agent_id, customers(full_name), product_versions!inner(product_id))").in("status", ["open", "partial"]).order("due_date");
  if (r[0]) qb = qb.gte("due_date", r[0]); if (r[1]) qb = qb.lte("due_date", r[1]);
  const { data } = await qb;
  const rows = (data ?? []).filter((i) => filt(i.contracts as never, sp)).map((i) => { const c = i.contracts as unknown as { number: string; customers: { full_name: string } }; const d = daysOverdue(i.due_date); return [formatDateBR(i.due_date), c.number, c.customers.full_name, `${i.number}ª`, <Money key="m" cents={Number(i.amount_cents) - Number(i.paid_cents)} />, d > 0 ? `${d} dias` : "—", <StatusBadge key="s" status={i.status} />]; });
  return { title: r[2], cols: ["Vencimento", "Contrato", "Cliente", "Parcela", "Saldo", "Atraso", "Status"], rows };
}

function filt(c: { agent_id: string; product_versions: { product_id: string } }, sp: Filters) {
  if (sp.agente && c.agent_id !== sp.agente) return false;
  if (sp.produto && c.product_versions?.product_id !== sp.produto) return false;
  return true;
}
