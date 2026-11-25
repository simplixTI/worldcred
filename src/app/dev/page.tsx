import { PageTitle } from "@/components/ui";
import { env } from "@/lib/env";
import { whatsappIsLive } from "@/lib/messaging";
import { adminClient } from "@/lib/supabase/admin";

export default async function DevHome() {
  const db = adminClient();
  const [{ count: events }, { count: audit }, { count: charges }, { count: ops }] = await Promise.all([
    db.from("provider_events").select("id", { count: "exact", head: true }),
    db.from("audit_log").select("id", { count: "exact", head: true }),
    db.from("pix_charges").select("id", { count: "exact", head: true }).eq("status", "active"),
    db.from("card_operations").select("id", { count: "exact", head: true }),
  ]);
  const rows: [string, string][] = [
    ["Supabase", env.supabaseUrl],
    ["Provedor Pix (cobranças)", env.pixProvider],
    ["Desembolso (Pix de saída)", env.pixProvider === "bacen" ? "real" : "simulado"],
    ["Mercado Pago", process.env.MP_ACCESS_TOKEN ? (process.env.MP_ACCESS_TOKEN.startsWith("TEST-") ? "credencial de teste" : "credencial de produção") : "não configurado"],
    ["Webhook MP", process.env.MP_WEBHOOK_SECRET ? "assinatura configurada" : "sem assinatura"],
    ["WhatsApp", `${process.env.WA_PROVIDER || "mock"}${whatsappIsLive() ? " (credenciais ok)" : " (sem credenciais)"}`],
    ["SMS", env.smsProvider],
    ["Consulta CPF", process.env.VAULTLOGS_API_KEY ? "configurada" : "não configurada"],
    ["MFA (variável)", env.mfaEnforcement],
    ["URL pública", env.appUrl],
  ];
  return (
    <>
      <PageTitle title="Ambiente" subtitle="Estado das integrações e contadores. Visível apenas para o painel DEV." />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4"><dl className="text-sm divide-y divide-line">{rows.map(([k, v]) => <div key={k} className="flex justify-between gap-4 py-2"><dt className="text-muted">{k}</dt><dd className="font-mono text-xs text-navy text-right break-all">{v}</dd></div>)}</dl></div>
        <div className="grid grid-cols-2 gap-3 content-start">
          {[["Eventos de provedor", events], ["Registros de auditoria", audit], ["Cobranças Pix ativas", charges], ["Operações de cartão", ops]].map(([k, v]) => <div key={String(k)} className="kpi"><span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{k}</span><span className="text-2xl font-extrabold text-navy tabular-nums">{v ?? 0}</span></div>)}
        </div>
      </div>
    </>
  );
}
