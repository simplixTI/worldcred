"use client";
import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion, useInView, animate, AnimatePresence } from "motion/react";
import { formatBRL } from "@/lib/finance/money";

const EASE = [0.16, 1, 0.3, 1] as const;

/** Lista que entra em cascata (uma vez, ao aparecer). Use para grids de cards/KPIs. */
export function Stagger({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div className={className} initial={reduce ? false : "hidden"} animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.055, delayChildren: delay } } }}>
      {children}
    </motion.div>
  );
}

export function Item({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={{ hidden: { opacity: 0, y: 12, filter: "blur(4px)" }, show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.5, ease: EASE } } }}>
      {children}
    </motion.div>
  );
}

/** Número que conta até o valor final quando entra na tela. `kind` é serializável (pode vir de Server Components). */
export function CountUp({ value, kind = "int", duration = 0.9 }: { value: number; kind?: "brl" | "int"; duration?: number }) {
  const format = kind === "brl" ? formatBRL : (n: number) => n.toLocaleString("pt-BR");
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-10% 0px" });
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(() => format(reduce ? value : 0));
  useEffect(() => {
    if (!inView) return;
    const controls = animate(reduce ? value : 0, value, { duration: reduce ? 0 : duration, ease: EASE, onUpdate: (v) => setDisplay(format(Math.round(v))) });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, value, reduce, duration, kind]);
  return <span ref={ref} className="tabular-nums">{display}</span>;
}

/** Transição de resultado inline (sucesso/erro) com entrada suave e saída rápida. */
export function Feedback({ children, show, kind }: { children: React.ReactNode; show: boolean; kind: "ok" | "error" }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div initial={{ opacity: 0, y: -4, height: 0 }} animate={{ opacity: 1, y: 0, height: "auto" }} exit={{ opacity: 0, height: 0, transition: { duration: 0.15 } }} transition={{ duration: 0.28, ease: EASE }}
          className={`overflow-hidden text-xs ${kind === "ok" ? "text-green" : "text-danger"}`}>
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Revela o QR Code: expansão circular com desfoque até a nitidez. O momento autoral do pagamento. */
export function QrReveal({ src, alt }: { src: string; alt: string }) {
  const reduce = useReducedMotion();
  return (
    <div className="relative w-56 h-56">
      {!reduce && <motion.span aria-hidden className="absolute inset-0 rounded-2xl border-2 border-green" initial={{ opacity: 0.6, scale: 0.9 }} animate={{ opacity: 0, scale: 1.25 }} transition={{ duration: 1.1, ease: "easeOut", delay: 0.25 }} />}
      <motion.img src={src} alt={alt} className="w-56 h-56 rounded-2xl border border-line bg-white relative"
        initial={reduce ? false : { clipPath: "circle(0% at 50% 50%)", filter: "blur(8px)", opacity: 0.4 }}
        animate={{ clipPath: "circle(75% at 50% 50%)", filter: "blur(0px)", opacity: 1 }}
        transition={{ duration: 0.8, ease: EASE }} />
    </div>
  );
}

/** Botão com estado "copiado" morfando o rótulo. */
export function CopyButton({ text, label = "Copiar código", done = "Copiado!" }: { text: string; label?: string; done?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <motion.button type="button" whileTap={{ scale: 0.97 }} className={`btn w-full ${copied ? "bg-green text-white" : "bg-navy text-white hover:bg-navy-deep"}`}
      onClick={async () => { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2200); }}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={copied ? "a" : "b"} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }} className="inline-flex items-center gap-2">
          {copied ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><motion.path d="M5 13l4 4L19 7" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.3 }} /></svg>
            : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>}
          {copied ? done : label}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}

/** Entrada de página: conteúdo visível por padrão (sem JS), com leve subida quando hidratado. */
export function PageEnter({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return <motion.div initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}>{children}</motion.div>;
}
