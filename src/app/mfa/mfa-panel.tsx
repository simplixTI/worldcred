"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Alert, Field } from "@/components/ui";

export function MfaPanel({ enrolled, next }: { enrolled: boolean; next: string }) {
  const supabase = createClient();
  const router = useRouter();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.mfa.listFactors();
      const verified = data?.totp?.find((f) => f.status === "verified");
      if (verified) { setFactorId(verified.id); return; }
      // remove fatores não verificados antigos e inicia novo cadastro
      for (const f of data?.totp ?? []) if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
      const { data: enroll, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `WorldCred ${new Date().toISOString().slice(0, 10)}` });
      if (error) { setError(error.message); return; }
      setFactorId(enroll.id); setQr(enroll.totp.qr_code); setSecret(enroll.totp.secret);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setBusy(true); setError(null);
    const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId });
    if (chErr) { setError(chErr.message); setBusy(false); return; }
    const { error: vErr } = await supabase.auth.mfa.verify({ factorId, challengeId: ch.id, code });
    if (vErr) { setError("Código inválido. Tente novamente."); setBusy(false); return; }
    router.push(next); router.refresh();
  }

  return (
    <form onSubmit={verify} className="space-y-4">
      {!enrolled && qr && (
        <div className="flex flex-col items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="QR Code para o autenticador" className="w-44 h-44 rounded-lg border border-line bg-white p-1" />
          <p className="text-xs text-muted text-center">Não consegue ler? Digite a chave: <code className="font-mono break-all">{secret}</code></p>
        </div>
      )}
      {enrolled && <Alert kind="info">Informe o código de 6 dígitos do seu aplicativo autenticador.</Alert>}
      <Field label="Código de 6 dígitos">
        <input className="input text-center tracking-[0.4em] font-mono text-lg" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} required />
      </Field>
      {error && <Alert kind="danger">{error}</Alert>}
      <button className="btn-primary w-full" disabled={busy || code.length !== 6}>{busy ? "Verificando…" : enrolled ? "Confirmar" : "Ativar MFA"}</button>
    </form>
  );
}
