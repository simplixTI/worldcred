import "server-only";
import { onlyDigits, normalizePhoneBR } from "@/lib/utils/mask";

export interface CpfLookupResult {
  available: boolean;          // serviço respondeu
  found: boolean;              // há dados para o CPF
  fullName?: string;
  phone?: string;              // E.164
  email?: string;
  birthDate?: string;          // YYYY-MM-DD
  motherName?: string;
  reason?: string;
}

const TIMEOUT_MS = 7000;

/**
 * Consulta cadastral por CPF no provedor configurado (VAULTLOGS_API_URL + VAULTLOGS_API_KEY).
 * Nunca lança: se o serviço estiver fora do ar, retorna available=false e o cadastro segue manual.
 * O formato de resposta não é fixo; o parser procura os campos usuais em qualquer nível.
 */
export async function lookupCpf(cpfInput: string): Promise<CpfLookupResult> {
  const cpf = onlyDigits(cpfInput);
  const base = process.env.VAULTLOGS_API_URL || "https://consulta.vaultlogs.app/api/v1/pessoa";
  const key = process.env.VAULTLOGS_API_KEY;
  if (!key) return { available: false, found: false, reason: "consulta não configurada" };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/${cpf}?key=${encodeURIComponent(key)}`, { signal: ctrl.signal, headers: { Accept: "application/json", "User-Agent": "WorldCred/1.0" }, cache: "no-store" });
    const text = await res.text();
    if (!res.ok) return { available: res.status < 500 && res.status !== 429, found: false, reason: `provedor respondeu ${res.status}` };
    let json: unknown;
    try { json = JSON.parse(text); } catch { return { available: false, found: false, reason: "resposta inválida do provedor" }; }
    const flat = flatten(json);
    const pick = (...keys: string[]) => { for (const k of keys) { const v = flat.get(k); if (v && String(v).trim()) return String(v).trim(); } return undefined; };
    const fullName = pick("nome", "nome_completo", "nomecompleto", "name", "full_name", "fullname", "razao_social");
    const phoneRaw = pick("celular", "telefone", "telefone_celular", "phone", "mobile", "telefone1", "fone", "whatsapp");
    const email = pick("email", "e_mail", "email1");
    const birth = pick("nascimento", "data_nascimento", "datanascimento", "dt_nascimento", "birth_date", "birthdate", "dob");
    const mother = pick("mae", "nome_mae", "nomemae", "mother", "mother_name");
    if (!fullName) return { available: true, found: false, reason: "CPF não localizado" };
    return {
      available: true, found: true, fullName: titleCase(fullName),
      phone: phoneRaw ? normalizePhoneBR(phoneRaw) ?? undefined : undefined,
      email: email?.toLowerCase(), birthDate: normalizeDate(birth), motherName: mother ? titleCase(mother) : undefined,
    };
  } catch (e) {
    return { available: false, found: false, reason: (e as Error).name === "AbortError" ? "tempo limite na consulta" : "consulta indisponível" };
  } finally { clearTimeout(t); }
}

/** Achata o JSON em um mapa chave(normalizada) → primeiro valor primitivo encontrado. */
function flatten(v: unknown, out = new Map<string, unknown>(), depth = 0): Map<string, unknown> {
  if (depth > 6 || v == null) return out;
  if (Array.isArray(v)) { for (const x of v) flatten(x, out, depth + 1); return out; }
  if (typeof v === "object") {
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      const nk = k.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "_");
      if (val != null && typeof val !== "object") { if (!out.has(nk)) out.set(nk, val); }
      else flatten(val, out, depth + 1);
    }
  }
  return out;
}

function titleCase(s: string) {
  const small = new Set(["de", "da", "do", "das", "dos", "e"]);
  return s.toLowerCase().split(/\s+/).map((w, i) => (small.has(w) && i > 0 ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(" ");
}

function normalizeDate(s?: string): string | undefined {
  if (!s) return undefined;
  const m1 = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m1) return `${m1[1]}-${m1[2]}-${m1[3]}`;
  const m2 = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/); if (m2) return `${m2[3]}-${m2[2]}-${m2[1]}`;
  return undefined;
}
