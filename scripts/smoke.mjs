/**
 * Varredura de fumaça: faz login real (admin, agente, cliente) e requisita todas as páginas
 * de cada portal contra um servidor local (BASE, padrão http://localhost:3100), incluindo rotas dinâmicas.
 * Uso: node scripts/smoke.mjs [BASE]
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const envLocal = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).trim()]; }));
const URL_ = envLocal.NEXT_PUBLIC_SUPABASE_URL, ANON = envLocal.NEXT_PUBLIC_SUPABASE_ANON_KEY, SERVICE = envLocal.SUPABASE_SERVICE_ROLE_KEY;
const BASE = process.argv[2] || "http://localhost:3100";
const ref = URL_.match(/https:\/\/([^.]+)/)[1];
const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });

async function cookieFor(email, password) {
  const r = await fetch(`${URL_}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  const sess = await r.json();
  if (!sess.access_token) throw new Error(`login falhou para ${email}: ${JSON.stringify(sess).slice(0, 120)}`);
  const val = "base64-" + Buffer.from(JSON.stringify(sess)).toString("base64url");
  const chunks = val.match(/.{1,3000}/g);
  return chunks.length === 1 ? `sb-${ref}-auth-token=${val}` : chunks.map((c, i) => `sb-${ref}-auth-token.${i}=${c}`).join("; ");
}

const ids = {};
{
  const { data: c } = await admin.from("contracts").select("id, customer_id, proposal_id").limit(1).single();
  const { data: i } = await admin.from("installments").select("id").eq("contract_id", c.id).in("status", ["open", "partial"]).order("number").limit(1).single();
  const { data: p } = await admin.from("proposals").select("id").eq("status", "sent").limit(1).maybeSingle();
  Object.assign(ids, { contract: c.id, customer: c.customer_id, installment: i?.id, proposalAccepted: c.proposal_id, proposalSent: p?.id });
}

const plan = [
  { who: "admin", email: process.env.SMOKE_ADMIN_EMAIL || "admin@worldcred.demo", pass: "Demo@12345", paths: ["/admin", "/admin/leads", "/admin/propostas", "/admin/desembolsos", "/admin/cobranca", "/admin/conciliacao", "/admin/produtos", "/admin/agentes", "/admin/configuracoes", "/admin/cartao", "/admin/auditoria", "/admin/sandbox", "/admin?lista=vencido", "/admin?lista=recebido"] },
  { who: "agente", email: "agente1@worldcred.demo", pass: "Demo@12345", paths: ["/agente", "/agente/clientes/novo", `/agente/clientes/${ids.customer}`, "/agente/propostas", "/agente/propostas/nova", `/agente/propostas/${ids.proposalAccepted}`, "/agente/carteira", `/agente/contratos/${ids.contract}`, "/agente/casos"] },
  { who: "cliente", email: "cliente1@worldcred.demo", pass: "Demo@12345", paths: ["/cliente", `/cliente/contratos/${ids.contract}`, `/cliente/parcelas/${ids.installment}`, `/cliente/propostas/${ids.proposalAccepted}`, "/cliente/recibos", "/cliente/pix"] },
  { who: "anon", paths: ["/", "/entrar", "/?ref=ana-2222", "/api/health"] },
];

let failures = 0;
for (const grp of plan) {
  const cookie = grp.email ? await cookieFor(grp.email, grp.pass) : "";
  for (const p of grp.paths) {
    const res = await fetch(BASE + p, { headers: cookie ? { cookie } : {}, redirect: "manual" });
    const ok = res.status === 200;
    if (!ok) failures++;
    console.log(`${ok ? "ok " : "ERR"} ${grp.who.padEnd(7)} ${res.status} ${p}${res.status >= 300 && res.status < 400 ? " -> " + res.headers.get("location") : ""}`);
  }
}
console.log(failures ? `\n${failures} falha(s)` : "\ntudo 200");
process.exit(failures ? 1 : 0);
