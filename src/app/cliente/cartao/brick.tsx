"use client";
import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { motion } from "motion/react";
import { payCardAction } from "../actions";
import { Alert } from "@/components/ui";
import { formatBRL } from "@/lib/finance/money";
import { CheckCircle2, ShieldCheck } from "lucide-react";

declare global { interface Window { MercadoPago?: new (key: string, opts?: { locale?: string }) => { bricks: () => { create: (type: string, containerId: string, settings: unknown) => Promise<{ unmount: () => void }> } } } }

type BrickForm = { token: string; installments: number; payment_method_id: string; issuer_id?: string; payer?: { email?: string; identification?: { type?: string; number?: string } } };

/** Checkout Transparente: o Brick do Mercado Pago renderiza o formulário do cartão aqui dentro e devolve só um token. */
export function CardBrick({ operationId, grossCents, installments, email, cpf, publicKey }: { operationId: string; grossCents: number; installments: number; email: string; cpf: string; publicKey: string }) {
  const [sdkReady, setSdkReady] = useState(false);
  const [result, setResult] = useState<{ status?: string; detail?: string; error?: string } | null>(null);
  const [mounting, setMounting] = useState(true);
  const controller = useRef<{ unmount: () => void } | null>(null);

  useEffect(() => {
    if (!sdkReady || !window.MercadoPago || controller.current) return;
    const mp = new window.MercadoPago(publicKey, { locale: "pt-BR" });
    let cancelled = false;
    mp.bricks().create("cardPayment", "wc-card-brick", {
      initialization: { amount: Number((grossCents / 100).toFixed(2)), payer: { email, identification: { type: "CPF", number: cpf } } },
      customization: {
        visual: { style: { theme: "default", customVariables: { baseColor: "#0f7a5a", borderRadiusMedium: "12px", fontSizeMedium: "14px" } }, hidePaymentButton: false },
        paymentMethods: { maxInstallments: installments, minInstallments: installments, types: { excluded: ["debit_card"] } },
      },
      callbacks: {
        onReady: () => setMounting(false),
        onError: (e: { message?: string }) => setResult({ error: e?.message ?? "erro no formulário do cartão" }),
        onSubmit: async (form: BrickForm) => {
          const r = await payCardAction(operationId, { token: form.token, installments: Number(form.installments), payment_method_id: form.payment_method_id, issuer_id: form.issuer_id, payer: form.payer });
          setResult(r);
          if (r.error) throw new Error(r.error);
        },
      },
    }).then((c) => { if (cancelled) c.unmount(); else controller.current = c; }).catch((e: Error) => setResult({ error: e.message }));
    return () => { cancelled = true; controller.current?.unmount(); controller.current = null; };
  }, [sdkReady, publicKey, grossCents, installments, email, cpf, operationId]);

  if (result?.status === "approved") {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="card p-8 text-center">
        <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 18, delay: 0.1 }} className="mx-auto grid place-items-center w-16 h-16 rounded-full bg-green-soft text-green mb-4"><CheckCircle2 size={32} /></motion.span>
        <h3 className="text-xl font-bold text-navy">Pagamento aprovado</h3>
        <p className="text-muted mt-2">A WorldCred confere a liberação e envia o valor líquido para a sua chave Pix. Acompanhe em “Minhas operações”.</p>
      </motion.div>
    );
  }
  return (
    <div className="card p-5 space-y-3">
      <Script src="https://sdk.mercadopago.com/js/v2" strategy="afterInteractive" onLoad={() => setSdkReady(true)} onReady={() => setSdkReady(true)} />
      <div className="flex items-center justify-between"><h3 className="font-bold text-navy">Dados do cartão</h3><span className="text-xs text-muted flex items-center gap-1"><ShieldCheck size={14} className="text-green" /> processado pelo Mercado Pago</span></div>
      <p className="text-sm text-muted">Total no cartão: <b className="text-navy tabular-nums">{formatBRL(grossCents)}</b> em {installments}x.</p>
      {mounting && <div className="skeleton h-40 rounded-xl" aria-label="Carregando formulário do cartão" />}
      <div id="wc-card-brick" />
      {result?.status && result.status !== "approved" && <Alert kind={result.status === "in_process" || result.status === "pending" ? "warn" : "danger"}>{result.status === "in_process" || result.status === "pending" ? "Pagamento em análise pela operadora. Avisaremos quando for aprovado." : `Pagamento não aprovado (${result.detail ?? result.status}). Tente outro cartão.`}</Alert>}
      {result?.error && <Alert kind="danger">{result.error}</Alert>}
    </div>
  );
}
