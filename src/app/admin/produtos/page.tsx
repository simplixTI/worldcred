import { adminClient } from "@/lib/supabase/admin";
import { PageTitle, StatusBadge, Money } from "@/components/ui";
import { formatRate } from "@/lib/finance/money";
import { formatDateBR, formatDateTimeBR } from "@/lib/finance/dates";
import { ProductForm } from "./product-form";

export default async function AdminProdutos() {
  const db = adminClient();
  const [{ data: products }, { data: audit }] = await Promise.all([
    db.from("products").select("*, product_versions(*)").order("principal_cents"),
    db.from("audit_log").select("*, profiles(full_name)").in("entity", ["products", "product_versions"]).order("created_at", { ascending: false }).limit(30),
  ]);
  return (
    <>
      <PageTitle title="Catálogo de produtos" subtitle="Cada alteração publica uma nova versão imutável. Propostas e contratos existentes conservam a versão original." />
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-3">
          {(products ?? []).map((p) => { const versions = (p.product_versions as { id: string; version: number; monthly_rate: string; allowed_terms: number[]; fee_cents: number; valid_from: string; valid_to: string | null; created_at: string }[]).sort((a, b) => b.version - a.version); const cur = versions[0]; return (
            <details key={p.id} className="card p-4">
              <summary className="cursor-pointer flex flex-wrap items-center justify-between gap-2"><span className="font-bold text-navy">{p.name} · <Money cents={p.principal_cents} /></span><span className="flex items-center gap-2 text-sm"><StatusBadge status={p.active ? "active" : "cancelled"} overrideLabel={p.active ? "Ativo" : "Inativo"} />{cur && <span className="text-muted">v{cur.version} · {formatRate(cur.monthly_rate, " a.m.")} · prazos {cur.allowed_terms.join("/")}</span>}</span></summary>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <div><h3 className="text-sm font-semibold text-navy mb-1">Versões</h3><ul className="text-xs space-y-1">{versions.map((v) => <li key={v.id}>v{v.version} · {formatRate(v.monthly_rate, " a.m.")} · prazos {v.allowed_terms.join(", ")} · tarifa <Money cents={v.fee_cents} /> · vigência {formatDateBR(v.valid_from)}{v.valid_to ? ` a ${formatDateBR(v.valid_to)}` : ""}</li>)}</ul></div>
                <div><h3 className="text-sm font-semibold text-navy mb-1">Publicar nova versão</h3><ProductForm product={{ id: p.id, name: p.name, principalCents: p.principal_cents, active: p.active, rate: cur?.monthly_rate ?? "0.15", terms: cur?.allowed_terms ?? [3, 6, 10, 12], fee: cur?.fee_cents ?? 0 }} /></div>
              </div>
            </details>
          ); })}
          <details className="card p-4"><summary className="cursor-pointer font-bold text-navy">+ Novo produto</summary><div className="mt-3 max-w-sm"><ProductForm /></div></details>
        </div>
        <div className="card p-4 text-xs"><h2 className="font-semibold text-navy mb-2 text-sm">Histórico de alterações</h2>
          <ul className="space-y-1 max-h-[32rem] overflow-auto">{(audit ?? []).map((a) => <li key={a.id} className="border-b border-line pb-1"><span className="text-muted">{formatDateTimeBR(a.created_at)}</span> · {(a.profiles as unknown as { full_name: string } | null)?.full_name ?? a.actor_role} · {a.entity} {a.action}{a.entity === "product_versions" && a.after ? ` v${(a.after as { version: number }).version} taxa ${(a.after as { monthly_rate: string }).monthly_rate}` : ""}</li>)}</ul></div>
      </div>
    </>
  );
}
