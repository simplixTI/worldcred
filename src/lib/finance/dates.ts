import { formatInTimeZone, toZonedTime } from "date-fns-tz";
import { addDays, addMonths, differenceInCalendarDays, parseISO } from "date-fns";

export const TZ = "America/Sao_Paulo";

/** Data civil de hoje em São Paulo, no formato YYYY-MM-DD. */
export function todaySP(now: Date = new Date()): string {
  return formatInTimeZone(now, TZ, "yyyy-MM-dd");
}

/** Converte um instante para a data civil de São Paulo (YYYY-MM-DD). */
export function toSPDate(instant: Date): string {
  return formatInTimeZone(instant, TZ, "yyyy-MM-dd");
}

/**
 * Vencimentos: 1ª parcela 30 dias após a data-base (confirmação do desembolso em SP),
 * demais no mesmo dia dos meses seguintes (date-fns limita ao último dia do mês).
 */
export function dueDates(baseDateISO: string, count: number): string[] {
  const base = parseISO(baseDateISO);
  const first = addDays(base, 30);
  const out: string[] = [];
  for (let k = 0; k < count; k++) out.push(formatISODate(addMonths(first, k)));
  return out;
}

export function formatISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Dias em atraso (positivo) ou dias até vencer (negativo) em relação a hoje em SP. */
export function daysOverdue(dueDateISO: string, now: Date = new Date()): number {
  return differenceInCalendarDays(parseISO(todaySP(now)), parseISO(dueDateISO));
}

export function formatDateBR(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  if (typeof iso === "string" && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  }
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return formatInTimeZone(d, TZ, "dd/MM/yyyy");
}

export function formatDateTimeBR(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return formatInTimeZone(d, TZ, "dd/MM/yyyy HH:mm");
}

/** Verifica se o instante está dentro da janela HH:mm–HH:mm em São Paulo. */
export function withinWindow(now: Date, start: string, end: string): boolean {
  const z = toZonedTime(now, TZ);
  const minutes = z.getHours() * 60 + z.getMinutes();
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return minutes >= sh * 60 + sm && minutes < eh * 60 + em;
}
