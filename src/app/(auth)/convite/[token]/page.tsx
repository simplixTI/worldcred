import { Logo } from "@/components/ui";
import { InviteForm } from "./invite-form";

export const dynamic = "force-dynamic";

export default async function ConvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <div className="min-h-dvh flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-6"><Logo size={44} /></div>
        <div className="card p-6">
          <h1 className="text-lg font-bold text-navy mb-1">Crie seu acesso</h1>
          <p className="text-sm text-muted mb-4">Defina e-mail e senha para acompanhar sua proposta, contrato e parcelas.</p>
          <InviteForm token={token} />
        </div>
      </div>
    </div>
  );
}
