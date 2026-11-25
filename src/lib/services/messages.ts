import "server-only";
import QRCode from "qrcode";
import { adminClient } from "@/lib/supabase/admin";
import { formatBRL } from "@/lib/finance/money";
import { formatDateBR } from "@/lib/finance/dates";
import { getOrCreateCharge } from "./charges";
import { createPortalLink } from "./links";
import { getSetting } from "./settings";

export interface WhatsAppSettings { authorized: boolean; send_qr_image: boolean; send_copy_paste: boolean; daily_cap: number; }
export const DEFAULT_WHATSAPP: WhatsAppSettings = { authorized: true, send_qr_image: true, send_copy_paste: true, daily_cap: 300 };
export async function getWhatsAppSettings(): Promise<WhatsAppSettings> {
  return { ...DEFAULT_WHATSAPP, ...(await getSetting<Partial<WhatsAppSettings>>("whatsapp", {})) };
}

export interface BuiltMessage { text: string; imageBase64?: string; copyPaste?: string; link: string; }

const FIRST = (name: string) => name.trim().split(/\s+/)[0];

/**
 * Monta a mensagem de cada etapa com o QR do Pix. A cobrança é criada/renovada na hora,
 * então o QR enviado é sempre válido e no valor do saldo atual.
 */
export async function buildInstallmentMessage(installmentId: string, stage: string, opts: { withQr: boolean }): Promise<BuiltMessage | { skip: string }> {
  const db = adminClient();
  const { data: i } = await db.from("installments").select("*, contracts(number, customer_id, customers(full_name, phone))").eq("id", installmentId).single();
  if (!i) return { skip: "parcela não encontrada" };
  const contract = i.contracts as unknown as { number: string; customer_id: string; customers: { full_name: string; phone: string | null } };
  const first = FIRST(contract.customers.full_name);
  const balance = Number(i.amount_cents) - Number(i.paid_cents);
  const { count: total } = await db.from("installments").select("id", { count: "exact", head: true }).eq("contract_id", i.contract_id);
  const { url } = await createPortalLink(contract.customer_id, i.id, 120);

  if (stage === "PAGO") {
    return { text: `✅ *Pagamento confirmado!*\n\nOlá, ${first}. Recebemos o pagamento da parcela ${i.number} de ${total} (${formatBRL(i.amount_cents)}).\n\nO recibo está no seu portal: ${url}\n\n_WorldCred_`, link: url };
  }

  let header: string;
  if (stage === "D-1") header = `Olá, ${first}! Sua parcela ${i.number} de ${total} vence *amanhã* (${formatDateBR(i.due_date)}).`;
  else if (stage === "D0") header = `Olá, ${first}! Sua parcela ${i.number} de ${total} vence *hoje* (${formatDateBR(i.due_date)}).`;
  else header = `Olá, ${first}. A parcela ${i.number} de ${total}, vencida em ${formatDateBR(i.due_date)}, está em aberto.`;

  let copyPaste: string | undefined; let imageBase64: string | undefined;
  if (opts.withQr) {
    try {
      const charge = await getOrCreateCharge(installmentId);
      copyPaste = charge.qr_payload;
      imageBase64 = await QRCode.toDataURL(charge.qr_payload, { margin: 2, width: 480, errorCorrectionLevel: "M" });
    } catch { /* sem QR: a mensagem segue com o link do portal */ }
  }

  const text = [
    header,
    ``,
    `💰 Valor: *${formatBRL(balance)}*`,
    copyPaste ? `Pague pelo QR Code acima ou copie o código abaixo no app do seu banco.` : `Pague com Pix pelo portal: ${url}`,
    ``,
    `Já pagou? É só aguardar: a baixa é automática.`,
    `_WorldCred · World Serviços de Crédito_`,
  ].join("\n");

  return { text, imageBase64, copyPaste, link: url };
}
