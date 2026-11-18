import Link from "next/link";
import Image from "next/image";
import { formatBRL } from "@/lib/finance/money";
import { CountUp } from "./motion";
import { Inbox } from "lucide-react";

export function Logo({ size = 36 }: { size?: number }) {
  return <Image src="/logo-wc.png" alt="WorldCred" width={Math.round(size * 3)} height={size} priority className="h-auto w-auto" style={{ maxHeight: size }} />;
}

export function PageTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
      <div>
        <h1 className="text-2xl md:text-[28px] font-extrabold text-navy leading-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted mt-1 max-w-2xl">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  draft: { label: "Rascunho", cls: "bg-bg text-muted" },
  sent: { label: "Aguardando aceite", cls: "bg-warn-soft text-warn" },
  accepted: { label: "Aceita · aguardando aprovação", cls: "bg-navy/10 text-navy" },
  approved: { label: "Aprovada", cls: "bg-green-soft text-green" },
  contracted: { label: "Contratada", cls: "bg-green-soft text-green" },
  declined: { label: "Recusada", cls: "bg-danger-soft text-danger" },
  rejected: { label: "Recusada pelo cliente", cls: "bg-danger-soft text-danger" },
  expired: { label: "Expirada", cls: "bg-bg text-muted" },
  cancelled: { label: "Cancelada", cls: "bg-bg text-muted" },
  pending_disbursement: { label: "Aguardando desembolso", cls: "bg-warn-soft text-warn" },
  disbursing: { label: "Desembolso em andamento", cls: "bg-navy/10 text-navy" },
  active: { label: "Ativo", cls: "bg-green-soft text-green" },
  settled: { label: "Liquidado", cls: "bg-navy/10 text-navy" },
  open: { label: "Em aberto", cls: "bg-warn-soft text-warn" },
  partial: { label: "Parcial", cls: "bg-warn-soft text-warn" },
  paid: { label: "Paga", cls: "bg-green-soft text-green" },
  pending: { label: "Pendente", cls: "bg-warn-soft text-warn" },
  authorized: { label: "Autorizado", cls: "bg-navy/10 text-navy" },
  confirmed: { label: "Confirmado", cls: "bg-green-soft text-green" },
  failed: { label: "Falhou", cls: "bg-danger-soft text-danger" },
  timeout: { label: "Tempo limite · consultar", cls: "bg-danger-soft text-danger" },
  queued: { label: "Na fila", cls: "bg-bg text-muted" },
  sending: { label: "Enviando", cls: "bg-navy/10 text-navy" },
  delivered: { label: "Entregue", cls: "bg-green-soft text-green" },
  skipped: { label: "Ignorada", cls: "bg-bg text-muted" },
  assigned: { label: "Atribuído", cls: "bg-navy/10 text-navy" },
  paused: { label: "Pausado", cls: "bg-warn-soft text-warn" },
  resolved: { label: "Resolvido", cls: "bg-green-soft text-green" },
  none: { label: "Não cadastrada", cls: "bg-bg text-muted" },
  validated: { label: "Validada", cls: "bg-green-soft text-green" },
  superseded: { label: "Substituída", cls: "bg-bg text-muted" },
  applied: { label: "Aplicado", cls: "bg-green-soft text-green" },
  reconciliation: { label: "Em conciliação", cls: "bg-warn-soft text-warn" },
  reversed: { label: "Estornado", cls: "bg-danger-soft text-danger" },
};

export function StatusBadge({ status, overrideLabel }: { status: string; overrideLabel?: string }) {
  const s = STATUS_LABEL[status] ?? { label: status, cls: "bg-bg text-muted" };
  return <span className={`badge ${s.cls}`}><span className="w-1.5 h-1.5 rounded-full bg-current mr-1.5 opacity-70" aria-hidden />{overrideLabel ?? s.label}</span>;
}

export const CASE_REASON: Record<string, string> = {
  overdue: "Cliente não pagou",
  payment_review: "Pagamento em conferência",
  message_failed: "Mensagem falhou",
  dispute: "Contestação",
  reconciliation: "Conciliação pendente",
  disbursement_timeout: "Desembolso sem confirmação",
  manual: "Manual",
};

export function Money({ cents, className = "" }: { cents: number | string | bigint | null | undefined; className?: string }) {
  return <span className={`tabular-nums ${className}`}>{formatBRL(cents)}</span>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="card p-10 text-center text-sm text-muted flex flex-col items-center gap-2">
      <span className="grid place-items-center w-10 h-10 rounded-full bg-bg text-navy/60"><Inbox size={18} /></span>
      {children}
    </div>
  );
}

const fmtBRL = (n: number) => formatBRL(n);

export function Kpi({ label, value, hint, href, cents }: { label: string; value?: React.ReactNode; hint?: string; href?: string; cents?: number | string }) {
  const inner = (
    <>
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{label}</span>
      <span className="text-[22px] md:text-2xl font-extrabold text-navy tabular-nums leading-tight">{cents !== undefined ? <CountUp value={Number(cents)} format={fmtBRL} /> : value}</span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </>
  );
  return href ? <Link href={href} className="kpi">{inner}</Link> : <div className="kpi">{inner}</div>;
}

export function Alert({ kind = "info", children }: { kind?: "info" | "success" | "warn" | "danger"; children: React.ReactNode }) {
  const cls = { info: "bg-navy/5 text-navy border-navy/15", success: "bg-green-soft text-green border-green/20", warn: "bg-warn-soft text-warn border-warn/20", danger: "bg-danger-soft text-danger border-danger/20" }[kind];
  return <div role={kind === "danger" ? "alert" : "status"} className={`rounded-xl border px-3.5 py-3 text-sm leading-relaxed ${cls}`}>{children}</div>;
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted mt-1.5">{hint}</span>}
    </label>
  );
}
