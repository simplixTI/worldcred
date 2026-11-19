import { describe, expect, it } from "vitest";

const describeIf = process.env.MP_ACCESS_TOKEN ? describe : describe.skip;

describeIf("Mercado Pago Pix (cobrança real pendente, cancelada ao final)", () => {
  it("cria cobrança com QR, consulta e cancela", async () => {
    process.env.PIX_PROVIDER = "mercadopago";
    const { MercadoPagoPixProvider } = await import("@/lib/pix/mercadopago");
    const p = new MercadoPagoPixProvider();
    const ref = "WCTESTE" + Date.now().toString(36).toUpperCase();
    const c = await p.createCharge({ reference: ref, amountCents: 100, payerName: "Teste WorldCred", payerCpf: "12345678909", description: "Teste de cobrança Pix WorldCred", expiresInSeconds: 600 });
    expect(c.qrPayload.startsWith("000201")).toBe(true);
    expect(c.receiverAccount.startsWith("MP-")).toBe(true);
    const st = await p.getCharge(ref);
    expect(st.status).toBe("active");
    expect(st.receiverAccount).toBe(c.receiverAccount);
    await p.cancelCharge(ref);
    expect((await p.getCharge(ref)).status).toBe("cancelled");
    console.log("MP Pix ok:", { id: c.providerChargeId, receiver: c.receiverAccount, expires: c.expiresAt });
  }, 60000);
});
