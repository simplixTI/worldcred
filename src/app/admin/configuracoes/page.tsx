import { PageTitle, Alert } from "@/components/ui";
import { getCollectionSettings, getSetting } from "@/lib/services/settings";
import { adminClient } from "@/lib/supabase/admin";
import { SettingsForm } from "./settings-form";
import { ModalidadesForm } from "./modalidades-form";
import { getLoanSettings } from "@/lib/services/loan";
import { getCardSettings } from "@/lib/services/card";
import { env } from "@/lib/env";
import { ActionButton } from "@/components/action-button";
import { saveSettings } from "../actions";

export default async function AdminConfiguracoes() {
  const collection = await getCollectionSettings();
  const loan = await getLoanSettings();
  const card = await getCardSettings();
  const security = await getSetting("security", { mfa_enforced: true });
  const pix = await getSetting("pix", { charge_ttl_hours: 24, receiver_account: "WC-SANDBOX-001" });
  const { data: lender } = await adminClient().from("lenders").select("*").eq("active", true).limit(1).maybeSingle();
  return (
    <>
      <PageTitle title="Configurações" subtitle="Taxas e limites das modalidades, régua de cobrança, segurança e credor." />
      <div className="card p-4 mb-4"><h2 className="font-semibold text-navy mb-1">Taxas e limites</h2><p className="text-xs text-muted mb-3">Valem para simulações e novas propostas. Contratos e propostas já geradas mantêm as condições originais.</p><ModalidadesForm loan={loan} card={card} /></div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4"><h2 className="font-semibold text-navy mb-2">Régua de cobrança</h2><SettingsForm collection={collection} /></div>
        <div className="space-y-4">
          <div className="card p-4 text-sm space-y-2">
            <h2 className="font-semibold text-navy">Segurança</h2>
            <p>MFA imposto para admin/desembolso (banco): <b>{security.mfa_enforced ? "sim" : "não"}</b> · variável MFA_ENFORCEMENT: <b>{env.mfaEnforcement}</b></p>
            <p className="text-xs text-muted">Com MFA imposto, admin e desembolso exigem código do autenticador a cada sessão. Ligue antes de operar com dinheiro real.</p>
            <ActionButton label={security.mfa_enforced ? "Desligar exigência de MFA" : "Ligar exigência de MFA"} className={security.mfa_enforced ? "btn-danger" : "btn-green"} confirm={security.mfa_enforced ? "Desligar o MFA para administradores?" : "Ligar o MFA? Todos os admins precisarão cadastrar o autenticador no próximo acesso."} action={saveSettings} args={["security", { mfa_enforced: !security.mfa_enforced }]} />
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
