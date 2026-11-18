import Decimal from "decimal.js";

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

/** Arredonda um Decimal (em reais) para centavos inteiros, half-up. */
export function toCents(value: Decimal | number | string): number {
  return new Decimal(value).times(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

export function fromCents(cents: number | bigint | string): Decimal {
  return new Decimal(typeof cents === "bigint" ? cents.toString() : cents).div(100);
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatBRL(cents: number | bigint | string | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  const n = Number(typeof cents === "bigint" ? cents.toString() : cents);
  return brl.format(n / 100);
}

/** 0.15 -> "15,00% a.m." */
export function formatRate(rate: number | string, suffix = ""): string {
  const pct = new Decimal(rate).times(100);
  return `${pct.toDecimalPlaces(2).toNumber().toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%${suffix}`;
}

/** "1.234,56" ou "1234.56" -> centavos */
export function parseBRLToCents(input: string): number {
  const clean = input.replace(/[R$\s]/g, "");
  const normalized = clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean;
  const d = new Decimal(normalized || 0);
  return toCents(d);
}
