import { adminClient } from "@/lib/supabase/admin";
import { PageTitle, Empty } from "@/components/ui";
import { formatDateTimeBR } from "@/lib/finance/dates";
import { redact } from "@/lib/utils/mask";

export default async function AdminAuditoria({ searchParams }: { searchParams: Promise<{ entidade?: string; q?: string }> }) {
  const sp = await searchParams;
  const db = adminClient();
  let q = db.from("audit_log").select("*, profiles(full_name)").order("created_at", { ascending: false }).limit(200);
  if (sp.entidade) q = q.eq("entity", sp.entidade);
  if (sp.q) q = q.ilike("action", `%${sp.q}%`);
  const { data } = await q;
  const { data: events } = await db.from("provider_events").select("*").order("received_at", { ascending: false }).limit(50);
  return (
    <>
      <PageTitle title="Auditoria" subtitle="Quem alterou o quê: taxas, produtos, permissões, ajustes manuais, pagamentos e desembolsos. Dados sensíveis redigidos." />
      <form className="flex gap-2 mb-4 text-sm"><input name="entidade" placeholder="entidade (ex.: products)" className="input max-w-48" defaultValue={sp.entidade} /><input name="q" placeholder="ação" className="input max-w-48" defaultValue={sp.q} /><button className="btn-primary">Filtrar</button></form>
      {!data?.length ? <Empty>Sem registros.</Empty> : (
        <div className="card overflow-x-auto mb-6"><table className="table"><thead><tr><th>Quando</th><th>Ator</th><th>Ação</th><th>Entidade</th><th>Detalhe</th></tr></thead>
          <tbody>{data.map((a) => <tr key={a.id}><td className="text-xs whitespace-nowrap">{formatDateTimeBR(a.created_at)}</td><td className="text-xs">{(a.profiles as unknown as { full_name: string } | null)?.full_name ?? a.actor_role}</td><td className="font-mono text-xs">{a.action}</td><td className="text-xs">{a.entity}<div className="text-muted font-mono">{a.entity_id?.slice(0, 8)}</div></td><td><details className="text-xs"><summary className="cursor-pointer text-muted">ver</summary><pre className="whitespace-pre-wrap max-w-xl">{JSON.stringify(redact({ before: a.before, after: a.after, meta: a.meta }), null, 1)}</pre></details></td></tr>)}</tbody></table></div>
      )}
      <h2 className="font-semibold text-navy mb-2">Eventos do provedor Pix (últimos 50)</h2>
      <div className="card overflow-x-auto"><table className="table"><thead><tr><th>Recebido</th><th>Tipo</th><th>Referência</th><th>Assinatura</th><th>Resultado</th></tr></thead>
        <tbody>{(events ?? []).map((e) => <tr key={e.id}><td className="text-xs">{formatDateTimeBR(e.received_at)}</td><td>{e.kind}</td><td className="font-mono text-xs">{e.reference}</td><td>{e.signature_valid ? "válida" : <span className="text-danger">inválida</span>}</td><td className="font-mono text-xs">{JSON.stringify(e.result)}</td></tr>)}</tbody></table></div>
    </>
  );
}
