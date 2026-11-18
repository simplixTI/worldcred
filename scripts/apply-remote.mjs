/**
 * Aplica migrations (e opcionalmente o seed) em um projeto Supabase via Management API.
 * Uso: SUPABASE_ACCESS_TOKEN=sbp_... node scripts/apply-remote.mjs <project_ref> [--seed] [--force]
 * Sem --force, aborta se já existirem tabelas no schema public.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const [ref, ...flags] = process.argv.slice(2);
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!ref || !token) { console.error("uso: SUPABASE_ACCESS_TOKEN=... node scripts/apply-remote.mjs <ref> [--seed] [--force]"); process.exit(1); }

async function query(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: sql }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${r.status}: ${text.slice(0, 600)}`);
  try { return JSON.parse(text); } catch { return text; }
}

const existing = await query("select count(*)::int as n from information_schema.tables where table_schema = 'public'");
const n = Array.isArray(existing) ? existing[0]?.n : 0;
if (n > 0 && !flags.includes("--force")) { console.error(`projeto já tem ${n} tabela(s) em public; use --force para aplicar mesmo assim`); process.exit(2); }

const dir = path.resolve("supabase/migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
for (const f of files) {
  process.stdout.write(`migration ${f} … `);
  await query(readFileSync(path.join(dir, f), "utf8"));
  console.log("ok");
}
if (flags.includes("--seed")) {
  process.stdout.write("seed … ");
  const out = await query(readFileSync(path.resolve("supabase/seed/seed.sql"), "utf8"));
  console.log("ok", JSON.stringify(out).slice(0, 200));
}
console.log("concluído em", ref);
