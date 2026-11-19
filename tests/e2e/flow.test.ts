/**
 * E2E contra o Supabase sandbox usando a chave de serviço (SUPABASE_SERVICE_ROLE_KEY no .env.local).
 * Cobre: agente cadastra → cliente aceita → aprovação → Pix de saída confirmado → parcelas → cobrança Pix →
 * baixa por webhook → lembretes cancelados → painel; e os cenários: webhook duplicado, QR expirado,
 * pagamento parcial, falha no SMS, tempo limite no desembolso, restrição de acesso entre carteiras.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const describeIf = service ? describe : describe.skip;

const ADMIN = "11111111-1111-4111-8111-111111111111";
const AGENT1 = "22222222-2222-4222-8222-222222222222";
const AGENT2 = "33333333-3333-4333-8333-333333333333";

describeIf("fluxo ponta a ponta (sandbox)", () => {
  const db = createClient(url, service ?? anon, { auth: { persistSession: false } });
  const suffix = Date.now().toString().slice(-6);
  let customerId: string, clientUserId: string, proposalId: string, contractId: string, disbursementId: string, installmentId: string, chargeRef: string;
  let mock: typeof import("@/lib/pix/mock").MockPixProvider.prototype;
  let processPixWebhook: typeof import("@/lib/services/webhook").processPixWebhook;

  beforeAll(async () => {
    process.env.PIX_PROVIDER = "mock"; process.env.SMS_PROVIDER = "mock";
    const pix = await import("@/lib/pix"); mock = pix.mockPix();
    processPixWebhook = (await import("@/lib/services/webhook")).processPixWebhook;
  });

  it("agente cadastra cliente (CPF válido, telefone que falha no SMS)", async () => {
    const { registerCustomer } = await import("@/lib/services/customers");
    const cpf = genCpf(suffix);
    const r = await registerCustomer(AGENT1, { fullName: `Teste E2E ${suffix}`, cpf, phone: "11988880000", email: `e2e${suffix}@worldcred.demo` });
    customerId = r.customerId;
    expect(r.reused).toBe(false);
    // cria acesso do cliente diretamente (equivalente ao convite) e cadastra chave Pix validada
    const { data: u } = await db.auth.admin.createUser({ email: `e2e${suffix}@worldcred.demo`, password: "Demo@12345", email_confirm: true });
    clientUserId = u.user!.id;
    await db.from("profiles").insert({ id: clientUserId, role: "client", full_name: `Teste E2E ${suffix}` });
    await db.from("customers").update({ user_id: clientUserId }).eq("id", customerId);
    const { setPixKey } = await import("@/lib/services/customers");
    const v = await setPixKey(clientUserId, cpf);
    expect(v.valid).toBe(true);
  });

  it("agente simula e envia proposta R$ 2.000 em 10x (parcela R$ 398,50)", async () => {
    const { createAndSendProposal, activeProductVersions } = await import("@/lib/services/proposals");
    const pv = (await activeProductVersions()).find((v) => v.products.principal_cents === 200000)!;
    const r = await createAndSendProposal(AGENT1, customerId, pv.id, 10);
    proposalId = r.proposalId;
    expect(r.smsOk).toBe(false); // telefone termina em 0000
    const { data: p } = await db.from("proposals").select("schedule_snapshot, status").eq("id", proposalId).single();
    expect(p!.status).toBe("sent");
    expect(p!.schedule_snapshot.regular_installment_cents).toBe(39850);
    expect(p!.schedule_snapshot.last_installment_cents).toBe(39858);
  });

  it("outro agente não enxerga a proposta (RLS entre carteiras)", async () => {
    const { data: s } = await db.auth.admin.generateLink({ type: "magiclink", email: "agente2@worldcred.demo" });
    const agent2 = createClient(url, anon, { auth: { persistSession: false } });
    const { error } = await agent2.auth.verifyOtp({ token_hash: s!.properties!.hashed_token, type: "magiclink" });
    expect(error).toBeNull();
    const { data, error: e1 } = await agent2.from("proposals").select("id").eq("id", proposalId);
    expect(e1?.message ?? null).toBeNull();
    expect(data).toEqual([]);
    const { data: cust, error: e2 } = await agent2.from("customers").select("id").eq("id", customerId);
    expect(e2?.message ?? null).toBeNull();
    expect(cust).toEqual([]);
    void AGENT2;
  });

  it("cliente aceita (RPC autenticada) e admin aprova → contrato + desembolso pendente", async () => {
    const { data: s } = await db.auth.admin.generateLink({ type: "magiclink", email: `e2e${suffix}@worldcred.demo` });
    const client = createClient(url, anon, { auth: { persistSession: false } });
    await client.auth.verifyOtp({ token_hash: s!.properties!.hashed_token, type: "magiclink" });
    const { data: acc, error } = await client.rpc("wc_accept_proposal", { p_proposal_id: proposalId, p_evidence: { ip: "127.0.0.1", text_hash: "e2e" } });
    expect(error).toBeNull(); expect(acc.status).toBe("accepted");
    const { rpc } = await import("@/lib/supabase/admin");
    const c = await rpc<{ id: string; status: string }>("wc_approve_proposal", { p_proposal_id: proposalId, p_actor: ADMIN, p_note: "e2e" });
    contractId = c.id; expect(c.status).toBe("pending_disbursement");
    const { data: d } = await db.from("disbursements").select("id, status, amount_cents").eq("contract_id", contractId).single();
    disbursementId = d!.id; expect(d!.status).toBe("pending"); expect(d!.amount_cents).toBe(200000);
  });

  it("tempo limite no desembolso: não reenvia; consulta confirma e ativa o contrato", async () => {
    const { authorizeAndExecuteDisbursement, reconcileDisbursement } = await import("@/lib/services/disbursements");
    // força cenário de timeout trocando a chave do cliente
    await db.from("customers").update({ pix_key: "timeout@e2e.demo", pix_key_type: "email" }).eq("id", customerId);
    const r1 = await authorizeAndExecuteDisbursement(disbursementId, ADMIN);
    expect(r1.status).toBe("timeout");
    const { data: d1 } = await db.from("disbursements").select("status, attempts").eq("id", disbursementId).single();
    expect(d1!.status).toBe("timeout"); expect(d1!.attempts).toBe(1);
    await new Promise((r) => setTimeout(r, 5200));
    const r2 = await reconcileDisbursement(disbursementId);
    expect(r2.status).toBe("confirmed");
    const { data: d2 } = await db.from("disbursements").select("status, attempts").eq("id", disbursementId).single();
    expect(d2!.attempts).toBe(1); // nenhum reenvio
    const { data: c } = await db.from("contracts").select("status").eq("id", contractId).single();
    expect(c!.status).toBe("active");
    const { data: inst } = await db.from("installments").select("id, number, amount_cents, due_date").eq("contract_id", contractId).order("number");
    expect(inst!.length).toBe(10);
    expect(inst![9].amount_cents).toBe(39858);
    installmentId = inst![0].id;
  });

  it("cobrança Pix: uma utilizável por vez; QR expirado é substituído com histórico", async () => {
    const { getOrCreateCharge } = await import("@/lib/services/charges");
    const c1 = await getOrCreateCharge(installmentId);
    const c1b = await getOrCreateCharge(installmentId);
    expect(c1b.id).toBe(c1.id);
    await db.from("pix_charges").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("id", c1.id);
    const c2 = await getOrCreateCharge(installmentId);
    expect(c2.id).not.toBe(c1.id); expect(c2.sequence).toBe(2);
    const { data: old } = await db.from("pix_charges").select("status, superseded_by").eq("id", c1.id).single();
    expect(old!.status).toBe("expired"); expect(old!.superseded_by).toBe(c2.id);
    chargeRef = c2.reference;
  });

  it("régua: lembrete enfileirado e SMS falha → tentativa registrada", async () => {
    await db.from("installments").update({ due_date: new Date().toISOString().slice(0, 10) }).eq("id", installmentId);
    const { rpc } = await import("@/lib/supabase/admin");
    await rpc("wc_enqueue_reminders", {});
    const { data: q } = await db.from("message_queue").select("id, status").eq("installment_id", installmentId).eq("stage", "D0").single();
    expect(q!.status).toBe("queued");
    const { dispatchDueMessages } = await import("@/lib/services/collections");
    await db.from("message_queue").update({ scheduled_for: new Date(Date.now() - 86400_000).toISOString() }).eq("id", q!.id);
    const r = await dispatchDueMessages(new Date(new Date().setUTCHours(15, 0, 0, 0))); // 12:00 SP (dentro da janela)
    expect(r.outside_window).toBe(false);
    const { data: q2 } = await db.from("message_queue").select("status, attempts, last_error").eq("id", q!.id).single();
    expect(q2!.status).toBe("failed"); expect(q2!.attempts).toBe(1); expect(q2!.last_error).toMatch(/recusou/);
  });

  it("pagamento parcial via webhook vai para conciliação e pausa a régua", async () => {
    const e = await mock.simulatePayment(chargeRef, 10000);
    const out = await processPixWebhook(e.raw, { "x-wc-signature": e.signature });
    expect(out.status).toBe(200); expect(out.body.outcome).toBe("partial_reconciliation");
    const { data: i } = await db.from("installments").select("status, in_review, paid_cents").eq("id", installmentId).single();
    expect(i!.status).toBe("open"); expect(i!.in_review).toBe(true); expect(i!.paid_cents).toBe(0);
    const { rpc } = await import("@/lib/supabase/admin");
    const { data: item } = await db.from("reconciliation_items").select("id").eq("installment_id", installmentId).eq("status", "open").single();
    await rpc("wc_resolve_reconciliation", { p_item_id: item!.id, p_action: "apply", p_actor: ADMIN, p_note: "e2e" });
    const { data: i2 } = await db.from("installments").select("status, paid_cents, in_review").eq("id", installmentId).single();
    expect(i2!.status).toBe("partial"); expect(i2!.paid_cents).toBe(10000); expect(i2!.in_review).toBe(false);
  });

  it("baixa do saldo por webhook, webhook duplicado ignorado, lembretes cancelados, painel atualizado", async () => {
    const { getOrCreateCharge } = await import("@/lib/services/charges");
    const c3 = await getOrCreateCharge(installmentId);
    expect(c3.amount_cents).toBe(29850);
    const e = await mock.simulatePayment(c3.reference);
    const out = await processPixWebhook(e.raw, { "x-wc-signature": e.signature });
    expect(out.body.outcome).toBe("applied");
    const dup = await processPixWebhook(e.raw, { "x-wc-signature": e.signature });
    expect(dup.body.outcome).toBe("already_processed");
    const bad = await processPixWebhook(e.raw, { "x-wc-signature": "x" });
    expect(bad.status).toBe(401);
    // mesmo pagamento reenviado como novo evento (id diferente) → duplicate_event
    const e2 = mock.signEvent({ ...(e.body as object), eventId: `evt_${Date.now()}` });
    const dup2 = await processPixWebhook(e2.raw, { "x-wc-signature": e2.signature });
    expect(dup2.body.outcome).toBe("duplicate_event");
    const { data: i } = await db.from("installments").select("status, paid_cents").eq("id", installmentId).single();
    expect(i!.status).toBe("paid"); expect(i!.paid_cents).toBe(39850);
    const { data: q } = await db.from("message_queue").select("status").eq("installment_id", installmentId);
    expect(q!.every((m) => m.status === "cancelled")).toBe(true);
    const { rpc } = await import("@/lib/supabase/admin");
    const dash = await rpc<Record<string, number>>("wc_dashboard", { p_from: new Date().toISOString().slice(0, 10), p_to: new Date().toISOString().slice(0, 10), p_product: null, p_agent: AGENT1 });
    expect(Number(dash.received_cents)).toBeGreaterThanOrEqual(39850);
    expect(Number(dash.disbursed_cents)).toBeGreaterThanOrEqual(200000);
  });
});

describeIf("cadastro próprio do cliente com ID do agente", () => {
  const db = createClient(url, service ?? anon, { auth: { persistSession: false } });
  it("cria usuário, cliente vinculado ao agente pelo código e proposta sem SMS", async () => {
    const suffix = Date.now().toString().slice(-6);
    const cpf = genCpf("9" + suffix);
    const { data: agent } = await db.rpc("wc_public_agent", { p_code: "wc1001" });
    expect((agent as { first_name: string }).first_name).toBe("Ana");
    const { data: u } = await db.auth.admin.createUser({ email: `self${suffix}@worldcred.demo`, password: "Demo@12345", email_confirm: true });
    await db.from("profiles").insert({ id: u.user!.id, role: "client", full_name: `Self ${suffix}` });
    const { rpc } = await import("@/lib/supabase/admin");
    const { cpfHash } = await import("@/lib/services/customers");
    const reg = await rpc<{ customer_id: string }>("wc_self_register_customer", { p_user_id: u.user!.id, p_full_name: `Self ${suffix}`, p_cpf: cpf, p_cpf_hash: cpfHash(cpf), p_phone: "+5511977770009", p_email: `self${suffix}@worldcred.demo`, p_agent: (agent as { id: string }).id });
    const { data: link } = await db.from("agent_customers").select("agent_id").eq("customer_id", reg.customer_id).single();
    expect(link!.agent_id).toBe(AGENT1);
    const { createAndSendProposal, activeProductVersions } = await import("@/lib/services/proposals");
    const pv = (await activeProductVersions()).find((v) => v.products.principal_cents === 100000)!;
    const p = await createAndSendProposal((agent as { id: string }).id, reg.customer_id, pv.id, 3, { skipSms: true });
    const { data: prop } = await db.from("proposals").select("status, agent_id").eq("id", p.proposalId).single();
    expect(prop!.status).toBe("sent"); expect(prop!.agent_id).toBe(AGENT1);
    // sem indicação também funciona
    const p2 = await createAndSendProposal(null, reg.customer_id, pv.id, 6, { skipSms: true });
    const { data: prop2 } = await db.from("proposals").select("agent_id").eq("id", p2.proposalId).single();
    expect(prop2!.agent_id).toBeNull();
  });
});

function genCpf(seed: string): string {
  const base = (seed + "123456789").slice(0, 9).split("").map(Number);
  const calc = (arr: number[]) => { const len = arr.length + 1; let s = 0; arr.forEach((d, i) => { s += d * (len - i); }); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  const d1 = calc(base); const d2 = calc([...base, d1]);
  const cpf = [...base, d1, d2].join("");
  return /^(\d)\1{10}$/.test(cpf) ? genCpf(seed + "7") : cpf;
}
