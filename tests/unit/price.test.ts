import { describe, expect, it } from "vitest";
import { buildSchedule, irrMonthly } from "@/lib/finance/price";
import { formatBRL, parseBRLToCents, toCents } from "@/lib/finance/money";
import { dueDates, daysOverdue, withinWindow } from "@/lib/finance/dates";
import { maskCPF, maskPixKey, isValidCPF } from "@/lib/utils/mask";

describe("Tabela Price — referência R$ 2.000 / 10 meses / 15% a.m.", () => {
  const s = buildSchedule({ principalCents: 200000, monthlyRate: "0.15", termMonths: 10 });

  it("parcela regular de R$ 398,50", () => {
    expect(s.regular_installment_cents).toBe(39850);
  });

  it("soma das amortizações fecha o principal e o saldo final é zero", () => {
    const amort = s.installments.reduce((a, x) => a + x.principal_cents, 0);
    expect(amort).toBe(200000);
    expect(s.installments[9].balance_after_cents).toBe(0);
  });

  it("última parcela ajustada e documentada", () => {
    expect(s.last_installment_cents).toBe(s.regular_installment_cents + s.last_installment_adjustment_cents);
    expect(Math.abs(s.last_installment_adjustment_cents)).toBeLessThanOrEqual(10);
    // valor exato calculado pelo motor (fixado para detectar regressões)
    expect(s.last_installment_adjustment_cents).toBe(8);
    expect(s.total_cents).toBe(39850 * 9 + s.last_installment_cents);
  });

  it("taxa anual e CET sem tarifas coincidem com a taxa", () => {
    expect(Number(s.annual_rate)).toBeCloseTo(Math.pow(1.15, 12) - 1, 6);
    expect(Number(s.cet_monthly)).toBeCloseTo(0.15, 3);
    expect(s.net_cents).toBe(200000);
  });

  it("tarifa reduz o líquido e eleva o CET", () => {
    const t = buildSchedule({ principalCents: 200000, monthlyRate: "0.15", termMonths: 10, feeCents: 5000 });
    expect(t.net_cents).toBe(195000);
    expect(Number(t.cet_monthly)).toBeGreaterThan(0.15);
    expect(t.regular_installment_cents).toBe(39850);
  });
});

describe("catálogo", () => {
  it.each([100000, 200000, 300000, 500000, 1000000])("principal %i fecha o saldo em todos os prazos", (p) => {
    for (const n of [3, 6, 10, 12]) {
      const s = buildSchedule({ principalCents: p, monthlyRate: "0.15", termMonths: n });
      expect(s.installments.at(-1)!.balance_after_cents).toBe(0);
      expect(s.installments.reduce((a, x) => a + x.principal_cents, 0)).toBe(p);
    }
  });
  it("taxa zero divide igualmente", () => {
    const s = buildSchedule({ principalCents: 100000, monthlyRate: 0, termMonths: 3 });
    expect(s.installments.map((x) => x.amount_cents)).toEqual([33333, 33333, 33334]);
  });
});

describe("TIR", () => {
  it("recupera a taxa de um fluxo Price puro", () => {
    const s = buildSchedule({ principalCents: 500000, monthlyRate: "0.03", termMonths: 12 });
    const r = irrMonthly(s.net_cents, s.installments.map((x) => x.amount_cents));
    expect(r.toNumber()).toBeCloseTo(0.03, 4);
  });
});

describe("dinheiro e datas", () => {
  it("arredondamento half-up", () => {
    expect(toCents("398.505")).toBe(39851);
    expect(toCents("398.504")).toBe(39850);
  });
  it("formata BRL", () => {
    expect(formatBRL(39850).replace(/ /g, " ")).toBe("R$ 398,50");
    expect(parseBRLToCents("R$ 1.234,56")).toBe(123456);
  });
  it("vencimentos: 30 dias depois e mensal, limitado ao fim do mês", () => {
    expect(dueDates("2026-01-01", 3)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
    expect(dueDates("2026-11-17", 2)).toEqual(["2026-12-17", "2027-01-17"]);
  });
  it("dias em atraso usa data civil de São Paulo", () => {
    // 2026-11-18 02:00Z = 2026-11-17 23:00 em SP
    expect(daysOverdue("2026-11-17", new Date("2026-11-18T02:00:00Z"))).toBe(0);
    expect(daysOverdue("2026-11-10", new Date("2026-11-18T02:00:00Z"))).toBe(7);
  });
  it("janela de envio", () => {
    expect(withinWindow(new Date("2026-11-17T12:00:00Z"), "08:00", "20:00")).toBe(true); // 09:00 SP
    expect(withinWindow(new Date("2026-11-17T02:00:00Z"), "08:00", "20:00")).toBe(false); // 23:00 SP
  });
});

describe("máscaras", () => {
  it("mascara CPF e chave Pix", () => {
    expect(maskCPF("12345678909")).toBe("***.456.789-**");
    expect(maskPixKey("carla@example.com")).toBe("car***********com");
  });
  it("valida CPF", () => {
    expect(isValidCPF("123.456.789-09")).toBe(true);
    expect(isValidCPF("111.111.111-11")).toBe(false);
    expect(isValidCPF("12345678900")).toBe(false);
  });
});
