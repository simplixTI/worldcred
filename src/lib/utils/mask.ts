export function onlyDigits(s: string): string {
  return (s || "").replace(/\D/g, "");
}

export function maskCPF(cpf: string | null | undefined): string {
  const d = onlyDigits(cpf || "");
  if (d.length !== 11) return "***";
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
}

export function formatCPF(cpf: string): string {
  const d = onlyDigits(cpf);
  if (d.length !== 11) return cpf;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function maskPixKey(key: string | null | undefined): string {
  if (!key) return "—";
  if (key.length <= 6) return "***";
  return key.slice(0, 3) + "*".repeat(Math.max(key.length - 6, 3)) + key.slice(-3);
}

export function maskPhone(phone: string | null | undefined): string {
  const d = onlyDigits(phone || "");
  if (d.length < 8) return "***";
  return `(**) *****-${d.slice(-4)}`;
}

export function isValidCPF(input: string): boolean {
  const d = onlyDigits(input);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

/** Normaliza telefone BR para E.164 (+55...). */
export function normalizePhoneBR(input: string): string | null {
  const d = onlyDigits(input);
  if (!d) return null;
  if (d.startsWith("55") && d.length >= 12) return `+${d}`;
  if (d.length === 10 || d.length === 11) return `+55${d}`;
  return null;
}

export function detectPixKeyType(key: string): "cpf" | "cnpj" | "email" | "phone" | "evp" | null {
  const k = key.trim();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(k)) return "evp";
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(k)) return "email";
  const d = onlyDigits(k);
  if (k.startsWith("+") && d.length >= 12) return "phone";
  if (d.length === 11 && isValidCPF(d)) return "cpf";
  if (d.length === 14) return "cnpj";
  if (d.length === 11 || d.length === 10) return "phone";
  return null;
}

/** Remove campos sensíveis de objetos antes de logar. */
export function redact<T>(value: T): T {
  const SENSITIVE = /cpf|pix_key|password|senha|token|secret|authorization|phone|telefone|email/i;
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        out[k] = SENSITIVE.test(k) ? "[redigido]" : walk(val);
      }
      return out;
    }
    return v;
  };
  return walk(value) as T;
}
