import Link from "next/link";
import { adminClient, rpc } from "@/lib/supabase/admin";
import { PageTitle, Kpi, Money, StatusBadge, Empty } from "@/components/ui";
import { Stagger, Item } from "@/components/motion";
import { todaySP, formatDateBR, daysOverdue } from "@/lib/finance/dates";
import { addDays, format, startOfMonth } from "date-fns";

type Filters = { de?: string; ate?: string; produto?: string; agente?: string; lista?: string };

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<Filters> }) {
  const sp = await searchParams;
  const today = todaySP();
  const from = sp.de || format(startOfMonth(new Date(today)), "yyyy-MM-dd");
  const to = sp.ate || today;
  const db = adminClient();
  const [m, { data: products }, { data: agents }] = await Promise.all([
    rpc<Record<string, number | string>>("wc_dashboard", { p_from: from, p_to: to, p_product: sp.produto || null, p_agent: sp.agente || null }),
    db.from("products").select("id, name").order("principal_cents"),
    db.from("profiles").select("id, full_name").eq("role", "agent").order("full_name"),
  ]);
  const q = (lista: string) => `/admin?${new URLSearchParams({ ...sp, lista }).toString()}`;
  const list = sp.lista ? await listFor(sp.lista, from, to, sp, today) : null;
  return (
    <>
      <PageTitle title="Painel" subtitle={`Período ${formatDateBR(from)} a ${formatDateBR(to)} · hoje ${formatDateBR(today)} (Brasília)`} />
      <form className="card p-3 mb-4 grid gap-2 sm:grid-cols-5 items-end text-sm">
        <label><span className="label">De</span><input type="date" name="de" defaultValue={from} className="input" /></label>
        <label><span className="label">Até</span><input type="date" name="ate" defaultValue={to} className="input" /></label>
        <label><span className="label">Produto</span><select name="produto" defaultValue={sp.produto ?? ""} className="input"><option value="">Todos</option>{products?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label><span className="label">Agente</span><select name="agente" defaultValue={sp.agente ?? ""} className="input"><option value="">Todos</option>{agents?.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}</select></label>
        <button className="btn-primary">Filtrar</button>
      </form>
      <Stagger className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Item><Kpi label="Principal desembolsado" cents={m.disbursed_cents} hint="no período" href={q("desembolsado")} /></Item>
        <Item><Kpi label="Recebido" cents={m.received_cents} hint="no período" href={q("recebido")} /></Item>
        <Item><Kpi label="Saldo aberto a vencer" cents={m.open_to_fall_due_cents} hint="parcelas futuras, líquido de pagos" href={q("avencer")} /></Item>
        <Item><Kpi label="Saldo vencido" cents={m.overdue_cents} hint={`${m.overdue_count} parcela(s)`} href={q("vencido")} /></Item>
        <Item><Kpi label="A receber em 7 dias" cents={m.due_7_cents} hint="inclui hoje" href={q("d7")} /></Item>
        <Item><Kpi label="A receber em 15 dias" cents={m.due_15_cents} hint="inclui hoje" href={q("d15")} /></Item>
        <Item><Kpi label="A receber em 30 dias" cents={m.due_30_cents} hint="inclui hoje" href={q("d30")} /></Item>
        <Item><Kpi label="Casos abertos" value={m.open_cases} href="/admin/cobranca" /></Item>
        <Item><Kpi label="Baixa automática" cents={m.auto_settled_cents} hint={`${m.auto_settled_count} pagamento(s) sem intervenção`} href={q("recebido")} /></Item>
        <Item><Kpi label="Intervenções humanas" value={m.human_interventions} hint="conciliações e casos resolvidos" href="/admin/conciliacao" /></Item>
      </Stagger>
      {list && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-2"><h2 className="font-semibold text-navy">{list.title}</h2><Link href={`/admin?${new URLSearchParams({ de: from, ate: to, produto: sp.produto ?? "", agente: sp.agente ?? "" })}`} className="text-sm text-muted underline">fechar</Link></div>
          {!list.rows.length ? <Empty>Sem itens.</Empty> : (
            <div className="card overflow-x-auto"><table className="table"><thead><tr>{list.cols.map((c) => <th key={c}>{c}</th>)}</tr></thead><tbody>{list.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody></table></div>
          )}
        </div>
      )}
    </>
  );
}

async function listFor(kind: string, from: string, to: string, sp: Filters, today: string) {
  const db = adminClient();
  const ctrFilter = (q: ReturnType<typeof db.from>) => q; void ctrFilter;
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
  const ranges: Record<string, [string | null, string | null, string]> = {
    avencer: [today, null, "Saldo aberto a vencer"], vencido: [null, format(addDays(new Date(today), -1), "yyyy-MM-dd"), "Parcelas vencidas"],
    d7: [today, format(addDays(new Date(today), 6), "yyyy-MM-dd"), "A receber em 7 dias"], d15: [today, format(addDays(new Date(today), 14), "yyyy-MM-dd"), "A receber em 15 dias"], d30: [today, format(addDays(new Date(today), 29), "yyyy-MM-dd"), "A receber em 30 dias"],
  };
  const r = ranges[kind]; if (!r) return null;
  let q = db.from("installments").select("id, number, due_date, amount_cents, paid_cents, status, contracts!inner(number, agent_id, customers(full_name), product_versions!inner(product_id))").in("status", ["open", "partial"]).order("due_date");
  if (r[0]) q = q.gte("due_date", r[0]); if (r[1]) q = q.lte("due_date", r[1]);
  const { data } = await q;
  const rows = (data ?? []).filter((i) => filt(i.contracts as never, sp)).map((i) => { const c = i.contracts as unknown as { number: string; customers: { full_name: string } }; const d = daysOverdue(i.due_date); return [formatDateBR(i.due_date), c.number, c.customers.full_name, `${i.number}ª`, <Money key="m" cents={Number(i.amount_cents) - Number(i.paid_cents)} />, d > 0 ? `${d} dias` : "—", <StatusBadge key="s" status={i.status} />]; });
  return { title: r[2], cols: ["Vencimento", "Contrato", "Cliente", "Parcela", "Saldo", "Atraso", "Status"], rows };
}

function filt(c: { agent_id: string; product_versions: { product_id: string } }, sp: Filters) {
  if (sp.agente && c.agent_id !== sp.agente) return false;
  if (sp.produto && c.product_versions?.product_id !== sp.produto) return false;
  return true;
}
