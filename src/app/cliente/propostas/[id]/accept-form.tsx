"use client";
import { useActionState } from "react";
import { acceptProposalAction } from "../../actions";
import { Alert } from "@/components/ui";

export function AcceptForm({ proposalId, termsText }: { proposalId: string; termsText: string }) {
  const [state, action, pending] = useActionState(acceptProposalAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="proposal_id" value={proposalId} />
      <input type="hidden" name="terms_text" value={termsText} />
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="agree" className="mt-1 accent-green" required /> Li e concordo com as condições acima, incluindo valor líquido, parcelas, juros, CET e forma de pagamento.</label>
      {state?.error && <Alert kind="danger">{state.error}</Alert>}
      <button className="btn-green w-full" disabled={pending}>{pending ? "Registrando…" : "Aceitar proposta"}</button>
      <p className="text-xs text-muted">Registramos data/hora, IP e a versão do texto como evidência do aceite.</p>
    </form>
  );
}
