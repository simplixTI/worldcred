"use client";
import { useState, useTransition } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Alert } from "@/components/ui";
import { QrCode, RefreshCw } from "lucide-react";

type Result = { error?: string; ok?: string; qr?: string; code?: string; state?: string } | undefined;

/** Pareamento do telefone: mostra o QR do WhatsApp para escanear em Aparelhos conectados. */
export function PairingPanel({ refresh }: { refresh: () => Promise<Result> }) {
  const [pending, start] = useTransition();
  const [r, setR] = useState<Result>();
  return (
    <div className="card p-4 text-sm space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-navy flex items-center gap-2"><QrCode size={16} /> Parear telefone</span>
        <button className="btn-outline !py-1.5 !px-3 text-xs" disabled={pending} onClick={() => start(async () => setR(await refresh()))}>
          <RefreshCw size={13} className={pending ? "animate-spin" : ""} /> {r?.qr ? "Atualizar" : "Gerar QR"}
        </button>
      </div>
      <p className="text-xs text-muted leading-relaxed">No celular com o chip da WorldCred: WhatsApp → Configurações → <b>Aparelhos conectados</b> → Conectar aparelho, e aponte para o QR abaixo. O telefone precisa ficar ligado e com internet.</p>
      <AnimatePresence mode="wait">
        {r?.qr && (
          <motion.div key={r.qr.slice(0, 24)} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={r.qr.startsWith("data:") ? r.qr : `data:image/png;base64,${r.qr}`} alt="QR de pareamento do WhatsApp" className="w-56 h-56 rounded-xl border border-line bg-white p-1" />
          </motion.div>
        )}
      </AnimatePresence>
      {r?.code && <p className="text-center text-xs text-muted">Código de pareamento: <b className="font-mono text-navy tracking-widest">{r.code}</b></p>}
      {r?.state && !r.qr && <Alert kind="info">{r.state}</Alert>}
      {r?.error && <Alert kind="danger">{r.error}</Alert>}
    </div>
  );
}
