"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { claimPaidAction, regenerateChargeAction } from "../../actions";
import { Alert, Money } from "@/components/ui";
import { QrReveal, CopyButton } from "@/components/motion";
import { formatDateTimeBR } from "@/lib/finance/dates";
import { QrCode, Clock, HandCoins } from "lucide-react";

interface Charge { reference: string; qr_data_url: string; qr_payload: string; expires_at: string; amount_cents: number; }

export function PayPanel({ installmentId, charge, claimOpen }: { installmentId: string; charge: Charge; claimOpen: boolean }) {
  const [msg, setMsg] = useState<{ error?: string; ok?: string } | undefined>();
  const [pending, start] = useTransition();
  const router = useRouter();
  const expired = new Date(charge.expires_at) < new Date();

  return (
    <div className="card p-5 space-y-5">
      <div className="flex items-center gap-2"><span className="grid place-items-center w-9 h-9 rounded-xl bg-green-soft text-green"><QrCode size={18} /></span><h2 className="font-bold text-navy text-lg">Pagar com Pix</h2></div>
      {expired ? (
        <Alert kind="warn">Este QR Code expirou. <button className="underline font-semibold cursor-pointer" disabled={pending} onClick={() => start(async () => { setMsg(await regenerateChargeAction(installmentId)); router.refresh(); })}>Gerar um novo</button></Alert>
      ) : (
        <div className="flex flex-col sm:flex-row gap-6 items-center">
          <QrReveal src={charge.qr_data_url} alt="QR Code Pix para pagamento da parcela" />
          <div className="flex-1 w-full space-y-3 text-sm">
            <div className="flex items-baseline justify-between"><span className="text-muted">Valor</span><Money cents={charge.amount_cents} className="text-2xl font-extrabold text-navy" /></div>
            <div className="flex items-center gap-1.5 text-xs text-muted"><Clock size={13} /> Válido até {formatDateTimeBR(charge.expires_at)} · ref. <span className="font-mono">{charge.reference}</span></div>
            <label className="label">Pix copia e cola</label>
            <textarea readOnly aria-label="Código Pix copia e cola" className="input font-mono text-[11px] leading-snug h-24 resize-none" value={charge.qr_payload} onFocus={(e) => e.currentTarget.select()} />
            <CopyButton text={charge.qr_payload} />
          </div>
        </div>
      )}
      <div className="border-t border-line pt-4">
        {claimOpen ? <Alert kind="info">Já recebemos seu aviso de pagamento. Estamos conferindo.</Alert> : (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <p className="text-sm text-muted flex-1">Pagou e a parcela ainda aparece em aberto? A confirmação chega automaticamente pelo banco; se demorar, avise-nos.</p>
            <button className="btn-outline shrink-0" disabled={pending} onClick={() => start(async () => { const note = prompt("Opcional: informe data/hora ou banco de origem") ?? ""; setMsg(await claimPaidAction(installmentId, note)); router.refresh(); })}><HandCoins size={15} /> Já paguei</button>
          </div>
        )}
        {msg?.ok && <div className="mt-3"><Alert kind="success">{msg.ok}</Alert></div>}
        {msg?.error && <div className="mt-3"><Alert kind="danger">{msg.error}</Alert></div>}
      </div>
    </div>
  );
}
