import Decimal from "decimal.js";
import { toCents } from "./money";

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export interface ScheduleInput {
  principalCents: number;
  monthlyRate: string | number; // ex.: 0.15
  termMonths: number;
  feeCents?: number; // tarifa (TAC) descontada do líquido
  iof?: { enabled: boolean; dailyRate: string | number; fixedRate: string | number } | null;
}

export interface ScheduleInstallment {
  number: number;
  amount_cents: number;
  principal_cents: number;
  interest_cents: number;
  balance_after_cents: number;
}

export interface ScheduleSnapshot {
  conditions_version: string;
  amortization: "price";
  rounding: "half_up_cents_last_installment_adjusted";
  principal_cents: number;
  fee_cents: number;
  iof_cents: number;
  net_cents: number;
  term_months: number;
  monthly_rate: string;
  annual_rate: string;
  regular_installment_cents: number;
  last_installment_cents: number;
  last_installment_adjustment_cents: number;
  total_cents: number;
  total_interest_cents: number;
  cet_monthly: string;
  cet_annual: string;
  installments: ScheduleInstallment[];
}

/** PMT da Tabela Price em Decimal (reais). */
export function pricePayment(principal: Decimal, i: Decimal, n: number): Decimal {
  if (i.isZero()) return principal.div(n);
  const factor = Decimal.pow(i.plus(1), -n);
  return principal.times(i).div(new Decimal(1).minus(factor));
}

/**
 * Gera o cronograma Price com parcelas fixas em centavos (half-up).
 * Juros de cada período = saldo × taxa, arredondado half-up; amortização = parcela − juros.
 * A última parcela é ajustada para zerar exatamente o saldo devedor.
 */
export function buildSchedule(input: ScheduleInput): ScheduleSnapshot {
  const principal = new Decimal(input.principalCents).div(100);
  const i = new Decimal(input.monthlyRate);
  const n = input.termMonths;
  if (n < 1) throw new Error("prazo inválido");

  const pmt = pricePayment(principal, i, n);
  const regular = toCents(pmt);

  const installments: ScheduleInstallment[] = [];
  let balance = input.principalCents;
  let totalInterest = 0;
  for (let k = 1; k <= n; k++) {
    const interest = toCents(new Decimal(balance).div(100).times(i));
    let amount = regular;
    let amort = amount - interest;
    if (k === n) {
      amort = balance; // fecha o saldo
      amount = amort + interest;
    }
    balance -= amort;
    totalInterest += interest;
    installments.push({ number: k, amount_cents: amount, principal_cents: amort, interest_cents: interest, balance_after_cents: balance });
  }
  const last = installments[n - 1];
  const total = installments.reduce((s, x) => s + x.amount_cents, 0);

  const fee = input.feeCents ?? 0;
  const iofCents = computeIOF(input, installments);
  const net = input.principalCents - fee - iofCents;

  const cetMonthly = irrMonthly(net, installments.map((x) => x.amount_cents));
  const annual = (r: Decimal) => Decimal.pow(r.plus(1), 12).minus(1);

  return {
    conditions_version: "price-v1",
    amortization: "price",
    rounding: "half_up_cents_last_installment_adjusted",
    principal_cents: input.principalCents,
    fee_cents: fee,
    iof_cents: iofCents,
    net_cents: net,
    term_months: n,
    monthly_rate: i.toFixed(8),
    annual_rate: annual(i).toFixed(8),
    regular_installment_cents: regular,
    last_installment_cents: last.amount_cents,
    last_installment_adjustment_cents: last.amount_cents - regular,
    total_cents: total,
    total_interest_cents: totalInterest,
    cet_monthly: cetMonthly.toFixed(8),
    cet_annual: annual(cetMonthly).toFixed(8),
    installments,
  };
}

/** IOF opcional (desligado por padrão). Aplica alíquota diária sobre amortização × dias (máx. 365) + fixa sobre o principal. */
function computeIOF(input: ScheduleInput, installments: ScheduleInstallment[]): number {
  if (!input.iof?.enabled) return 0;
  const daily = new Decimal(input.iof.dailyRate);
  const fixed = new Decimal(input.iof.fixedRate);
  let total = new Decimal(0);
  installments.forEach((x, idx) => {
    const days = Math.min(30 * (idx + 1), 365);
    total = total.plus(new Decimal(x.principal_cents).times(daily).times(days));
  });
  total = total.plus(new Decimal(input.principalCents).times(fixed));
  return total.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

/**
 * TIR mensal (CET) por Newton-Raphson com fallback por bissecção.
 * Fluxo: −net em t=0, +parcela_k em t=k.
 */
export function irrMonthly(netCents: number, flowsCents: number[]): Decimal {
  const net = new Decimal(netCents);
  const f = (r: Decimal) => {
    let v = net.neg();
    flowsCents.forEach((c, idx) => { v = v.plus(new Decimal(c).div(Decimal.pow(r.plus(1), idx + 1))); });
    return v;
  };
  const df = (r: Decimal) => {
    let v = new Decimal(0);
    flowsCents.forEach((c, idx) => {
      const t = idx + 1;
      v = v.minus(new Decimal(c).times(t).div(Decimal.pow(r.plus(1), t + 1)));
    });
    return v;
  };
  let r = new Decimal(0.1);
  for (let it = 0; it < 100; it++) {
    const fv = f(r);
    const d = df(r);
    if (d.isZero()) break;
    const next = r.minus(fv.div(d));
    if (next.lte(-0.99)) break;
    if (next.minus(r).abs().lt(new Decimal(1e-14))) return next;
    r = next;
  }
  // bissecção
  let lo = new Decimal(0), hi = new Decimal(5);
  for (let it = 0; it < 300; it++) {
    const mid = lo.plus(hi).div(2);
    if (f(mid).gt(0)) lo = mid; else hi = mid;
  }
  return lo.plus(hi).div(2);
}
