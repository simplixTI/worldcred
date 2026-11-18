"use client";
import { CopyButton } from "@/components/motion";
import { Link2 } from "lucide-react";

export function ReferralCard({ url }: { url: string }) {
  return (
    <div className="card p-5 flex flex-col sm:flex-row sm:items-center gap-4">
      <span className="grid place-items-center w-11 h-11 rounded-xl bg-green-soft text-green shrink-0"><Link2 size={20} /></span>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-navy">Seu link de indicação</div>
        <p className="text-sm text-muted">Quem pedir crédito por este link entra direto na sua carteira, já com o convite enviado.</p>
        <code className="block text-xs text-navy mt-1 truncate">{url}</code>
      </div>
      <div className="sm:w-48"><CopyButton text={url} label="Copiar link" done="Link copiado!" /></div>
    </div>
  );
}
