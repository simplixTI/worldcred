import { PageTitle, Alert } from "@/components/ui";
import { getCollectionSettings, getSetting } from "@/lib/services/settings";
import { adminClient } from "@/lib/supabase/admin";
import { SettingsForm } from "./settings-form";
import { env } from "@/lib/env";

export default async function AdminConfiguracoes() {
  const collection = await getCollectionSettings();
  const security = await getSetting("security", { mfa_enforced: true });
  const pix = await getSetting("pix", { charge_ttl_hours: 24, receiver_account: "WC-SANDBOX-001" });
  const { data: lender } = await adminClient().from("lenders").select("*").eq("active", true).limit(1).maybeSingle();
  return (
    <>
      <PageTitle title="Configurações" subtitle="Régua de cobrança, janela de envio, segurança e credor." />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4"><h2 className="font-semibold text-navy mb-2">Régua de cobrança</h2><SettingsForm collection={collection} /></div>
        <div className="space-y-4">
          <div className="card p-4 text-sm space-y-2">
            <h2 className="font-semibold text-navy">Segurança</h2>
            <p>MFA imposto para admin/desembolso (banco): <b>{security.mfa_enforced ? "sim" : "não"}</b> · variável MFA_ENFORCEMENT: <b>{env.mfaEnforcement}</b></p>
            <p className="text-xs text-muted">Com MFA imposto, escritas administrativas via RLS exigem sessão aal2. Desative somente em ambiente de teste.</p>
          </div>
          <div className="card p-4 text-sm space-y-1">
            <h2 className="font-semibold text-navy">Credor responsável</h2>
            {lender ? <><p>{lender.legal_name}</p><p className="text-muted">CNPJ {lender.cnpj}</p><p className="text-muted">Enquadramento: {lender.regulatory_framework ?? "a validar"}</p><p className="text-muted">Conta recebedora (cobranças): {pix.receiver_account} · QR válido por {pix.charge_ttl_hours}h</p></> : <Alert kind="warn">Nenhum credor cadastrado.</Alert>}
          </div>
          <Alert kind="warn">Antes de habilitar dinheiro real: confirmar o enquadramento da operação, as condições contratuais e o CET com assessoria jurídica/contábil, e validar com o PSP os fluxos autorizados (cobrança, pagamento de saída, consulta de chave, webhook) e os canais de mensagem (SMS/WhatsApp).</Alert>
        </div>
      </div>
    </>
  );
}
