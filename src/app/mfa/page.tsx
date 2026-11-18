import { redirect } from "next/navigation";
import { getSession, homeFor } from "@/lib/auth";
import { Logo } from "@/components/ui";
import { MfaPanel } from "./mfa-panel";

export const dynamic = "force-dynamic";

export default async function MfaPage() {
  const s = await getSession();
  if (!s) redirect("/entrar");
  return (
    <div className="min-h-dvh flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-6"><Logo size={44} /></div>
        <div className="card p-6">
          <h1 className="text-lg font-bold text-navy mb-1">Autenticação em dois fatores</h1>
          <p className="text-sm text-muted mb-4">Funções administrativas e de desembolso exigem MFA. Use um aplicativo autenticador (Google Authenticator, Authy, 1Password…).</p>
          <MfaPanel enrolled={s.mfaEnrolled} next={homeFor(s.role)} />
        </div>
      </div>
    </div>
  );
}
