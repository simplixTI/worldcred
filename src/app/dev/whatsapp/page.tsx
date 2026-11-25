import { PageTitle, Alert, StatusBadge, Empty } from "@/components/ui";
import { whatsappProvider, whatsappIsLive, type ConnectionStatus } from "@/lib/messaging";
import { adminClient } from "@/lib/supabase/admin";
import { getCollectionSettings } from "@/lib/services/settings";
import { getWhatsAppSettings } from "@/lib/services/messages";
import { formatDateTimeBR } from "@/lib/finance/dates";
import { maskPhone } from "@/lib/utils/mask";
import { ActionButton } from "@/components/action-button";
import { sendWhatsAppTest, refreshWhatsAppPairing } from "@/app/admin/actions";
import { PairingPanel } from "./pairing";

export const dynamic = "force-dynamic";

export default async function DevWhatsApp() {
  const p = whatsappProvider();
  const live = whatsappIsLive();
  const [status, cfg, wa, { data: queue }] = await Promise.all([
    (p.status ? p.status().catch((e) => ({ connected: false, state: "erro", detail: (e as Error).message })) : Promise.resolve({ connected: false, state: "sem suporte" })) as Promise<ConnectionStatus>,
    getCollectionSettings(),
    getWhatsAppSettings(),
    adminClient().from("message_queue").select("*, customers(full_name)").eq("channel", "whatsapp").order("created_at", { ascending: false }).limit(25),
  ]);
  const provider = process.env.WA_PROVIDER || "mock";
  return (
    <>
      <PageTitle title="WhatsApp" subtitle="Conexão do número, régua e últimas mensagens. O QR do Pix vai na própria mensagem." />
      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <div className="space-y-4">
          <div className="card p-4 text-sm space-y-3">
            <div className="flex items-center justify-between"><span className="font-semibold text-navy">Conexão</span><StatusBadge status={status.connected ? "active" : "failed"} overrideLabel={status.connected ? "Conectado" : status.state} /></div>
            <dl className="text-xs text-muted space-y-1">
              <div className="flex justify-between"><dt>Provedor</dt><dd className="font-mono text-navy">{provider}</dd></div>
              <div className="flex justify-between"><dt>Credenciais</dt><dd className={live ? "text-green" : "text-warn"}>{live ? "configuradas" : "ausentes"}</dd></div>
              <div className="flex justify-between"><dt>Autorizado</dt><dd>{wa.authorized ? "sim" : "não"}</dd></div>
              <div className="flex justify-between"><dt>Envia QR como imagem</dt><dd>{wa.send_qr_image ? "sim" : "não"}</dd></div>
              <div className="flex justify-between"><dt>Fallback SMS</dt><dd>{cfg.fallback_sms ? "sim" : "não"}</dd></div>
              <div className="flex justify-between"><dt>Régua</dt><dd className="font-mono text-navy">{cfg.stages.map((s) => s.code).join(" · ")}</dd></div>
              <div className="flex justify-between"><dt>Janela</dt><dd>{cfg.window_start}–{cfg.window_end}</dd></div>
            </dl>
            {status.detail && <Alert kind="warn">{status.detail}</Alert>}
            {!live && <Alert kind="info">Defina <code>WA_PROVIDER</code> e as credenciais na Vercel. Com <code>mock</code>, as mensagens ficam registradas aqui sem sair.</Alert>}
            <ActionButton label="Enviar teste para o meu número" action={sendWhatsAppTest} args={[]} prompt="Número com DDD (ex.: 11999998888):" className="btn-outline w-full" />
          </div>
          {p.pairingQr && <PairingPanel refresh={refreshWhatsAppPairing} />}
        </div>
        <div className="card overflow-x-auto">
          {!queue?.length ? <Empty>Nenhuma mensagem de WhatsApp na fila ainda.</Empty> : (
            <table className="table"><thead><tr><th>Quando</th><th>Cliente</th><th>Etapa</th><th>Status</th><th>Detalhe</th></tr></thead>
              <tbody>{queue.map((m) => (
                <tr key={m.id}>
                  <td className="text-xs text-muted whitespace-nowrap">{formatDateTimeBR(m.sent_at ?? m.created_at)}</td>
                  <td>{(m.customers as unknown as { full_name: string } | null)?.full_name}<div className="text-xs text-muted">{maskPhone(m.recipient)}</div></td>
                  <td><span className="badge bg-navy/10 text-navy">{m.stage}</span></td>
                  <td><StatusBadge status={m.status} /></td>
                  <td className="text-xs text-muted max-w-xs"><div className="truncate">{m.last_error || m.skip_reason || m.provider_message_id || ""}</div></td>
                </tr>
              ))}</tbody></table>
          )}
        </div>
      </div>
    </>
  );
}
