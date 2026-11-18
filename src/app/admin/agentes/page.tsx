import { adminClient } from "@/lib/supabase/admin";
import { PageTitle, StatusBadge } from "@/components/ui";
import { formatDateTimeBR } from "@/lib/finance/dates";
import { ActionButton } from "@/components/action-button";
import { setAgentActive } from "../actions";
import { NewAgentForm } from "./new-agent-form";

export default async function AdminAgentes() {
  const db = adminClient();
  const [{ data: users }, { data: audit }] = await Promise.all([
    db.from("profiles").select("*").in("role", ["agent", "admin"]).order("role").order("full_name"),
    db.from("audit_log").select("*").eq("entity", "profiles").order("created_at", { ascending: false }).limit(30),
  ]);
  const counts = new Map<string, number>();
  const { data: ac } = await db.from("agent_customers").select("agent_id");
  for (const r of ac ?? []) counts.set(r.agent_id, (counts.get(r.agent_id) ?? 0) + 1);
  return (
    <>
      <PageTitle title="Agentes e permissões" subtitle="Desativar revoga o acesso e preserva a autoria dos contratos." />
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="card overflow-x-auto"><table className="table"><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Clientes</th><th>Status</th><th></th></tr></thead>
          <tbody>{(users ?? []).map((u) => <tr key={u.id}><td>{u.full_name}</td><td className="text-xs">{u.email}</td><td>{u.role === "admin" ? "Administrador" : "Agente"}</td><td>{counts.get(u.id) ?? 0}</td><td><StatusBadge status={u.active ? "active" : "cancelled"} overrideLabel={u.active ? "Ativo" : "Inativo"} /></td>
            <td>{u.role === "agent" && <ActionButton label={u.active ? "Desativar" : "Reativar"} className={u.active ? "btn-danger !py-1.5 !px-3 text-xs" : "btn-green !py-1.5 !px-3 text-xs"} confirm={u.active ? "Desativar este agente? O acesso é revogado imediatamente." : undefined} onRun={() => setAgentActive(u.id, !u.active)} />}</td></tr>)}</tbody></table></div>
        <div className="space-y-4">
          <div className="card p-4"><h2 className="font-semibold text-navy mb-2">Novo usuário</h2><NewAgentForm /></div>
          <div className="card p-4 text-xs"><h2 className="font-semibold text-navy mb-2 text-sm">Histórico de permissões</h2>
            <ul className="space-y-1 max-h-72 overflow-auto">{(audit ?? []).map((a) => <li key={a.id} className="border-b border-line pb-1"><span className="text-muted">{formatDateTimeBR(a.created_at)}</span> · {a.action} · {(a.after as { full_name?: string })?.full_name ?? (a.before as { full_name?: string })?.full_name}{a.action === "update" && (a.before as { active?: boolean })?.active !== (a.after as { active?: boolean })?.active && <b> ({(a.after as { active?: boolean })?.active ? "ativado" : "desativado"})</b>}</li>)}</ul></div>
        </div>
      </div>
    </>
  );
}
