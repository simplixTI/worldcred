import { beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const describeIf = service ? describe : describe.skip;
const ADMIN = "11111111-1111-4111-8111-111111111111";

describeIf("régua de WhatsApp com QR do Pix", () => {
  const db = createClient(url, service ?? anon, { auth: { persistSession: false } });
  let contractId: string, instId: string;

  beforeAll(async () => {
    process.env.WA_PROVIDER = "mock"; process.env.SMS_PROVIDER = "mock"; process.env.PIX_PROVIDER = "mock";
    const { data: c } = await db.from("contracts").select("id").eq("status", "active").limit(1).single();
    contractId = c!.id;
  });

  async function newInstallment(dueOffsetDays: number) {
    const { data: max } = await db.from("installments").select("number").eq("contract_id", contractId).order("number", { ascending: false }).limit(1).single();
    const due = new Date(Date.now() + dueOffsetDays * 86400_000).toISOString().slice(0, 10);
    const { data, error } = await db.from("installments").insert({ contract_id: contractId, number: max!.number + 1, due_date: due, amount_cents: 1234, principal_cents: 1234, interest_cents: 0, status: "open" }).select("id, number").single();
    if (error) throw new Error(error.message);
    return data;
  }

  it("enfileira D-1 para parcela que vence amanhã", async () => {
    const i = await newInstallment(1);
    instId = i.id;
    const { rpc } = await import("@/lib/supabase/admin");
    await rpc("wc_enqueue_reminders", {});
    const { data: msg } = await db.from("message_queue").select("stage, channel, media_kind, status").eq("installment_id", instId).maybeSingle();
    expect(msg?.stage).toBe("D-1");
    expect(msg?.channel).toBe("whatsapp");
    expect(msg?.media_kind).toBe("pix_qr");
  });

  it("monta a mensagem com QR, valor e link do portal", async () => {
    const { buildInstallmentMessage } = await import("@/lib/services/messages");
    const built = await buildInstallmentMessage(instId, "D-1", { withQr: true });
    expect("skip" in built).toBe(false);
    if ("skip" in built) return;
    expect(built.text).toContain("vence *amanhã*");
    expect(built.text.replace(/ /g, " ")).toContain("R$ 12,34");
    expect(built.imageBase64?.startsWith("data:image/png;base64,")).toBe(true);
    expect(built.copyPaste?.startsWith("000201")).toBe(true);
    expect(built.link).toContain("/l/");
  }, 30000);

  it("despacha pelo WhatsApp dentro da janela e registra o envio", async () => {
    const { dispatchDueMessages } = await import("@/lib/services/collections");
    await db.from("message_queue").update({ scheduled_for: new Date(Date.now() - 60_000).toISOString() }).eq("installment_id", instId);
    const r = await dispatchDueMessages(new Date(new Date().setUTCHours(15, 0, 0, 0)));
    expect(r.outside_window).toBe(false);
    const { data: msg } = await db.from("message_queue").select("status, provider, sent_body").eq("installment_id", instId).single();
    expect(msg!.status).toBe("sent");
    expect(msg!.sent_body).toContain("WorldCred");
  }, 30000);

  it("baixa manual quita a parcela, cancela lembretes e enfileira a confirmação", async () => {
    const i = await newInstallment(-2); // vence há 2 dias => etapa D2
    const { rpc } = await import("@/lib/supabase/admin");
    await rpc("wc_enqueue_reminders", {});
    const { data: before } = await db.from("message_queue").select("id, stage").eq("installment_id", i.id);
    expect(before!.some((m) => m.stage === "D2")).toBe(true);
    const r = await rpc<{ outcome: string }>("wc_manual_settle", { p_installment: i.id, p_amount_cents: 1234, p_actor: ADMIN, p_note: "teste automatizado" });
    expect(r.outcome).toBe("settled");
    const { data: inst } = await db.from("installments").select("status, paid_cents").eq("id", i.id).single();
    expect(inst!.status).toBe("paid");
    const { data: after } = await db.from("message_queue").select("stage, status").eq("installment_id", i.id);
    expect(after!.filter((m) => m.stage !== "PAGO").every((m) => m.status === "cancelled")).toBe(true);
    expect(after!.some((m) => m.stage === "PAGO" && m.status === "queued")).toBe(true);
    const { data: pay } = await db.from("payments").select("kind, created_by, status").eq("installment_id", i.id).single();
    expect(pay!.kind).toBe("manual"); expect(pay!.created_by).toBe(ADMIN); expect(pay!.status).toBe("applied");
    // limpeza
    await db.from("message_queue").delete().eq("installment_id", i.id);
    await db.from("payments").delete().eq("installment_id", i.id);
    await db.from("installments").delete().eq("id", i.id);
  }, 30000);

  it("limpa a parcela de teste", async () => {
    await db.from("message_queue").delete().eq("installment_id", instId);
    await db.from("pix_charges").delete().eq("installment_id", instId);
    await db.from("installments").delete().eq("id", instId);
    const { data } = await db.from("installments").select("id").eq("id", instId).maybeSingle();
    expect(data).toBeNull();
  });
});
