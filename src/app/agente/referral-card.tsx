"use client";
import { CopyButton } from "@/components/motion";
import { Link2 } from "lucide-react";

export function ReferralCard({ code, url }: { code: string; url: string }) {
  return (
    <div className="brand-mesh text-white rounded-2xl p-6 relative overflow-hidden">
      <div aria-hidden className="absolute -right-20 -top-20 w-64 h-64 rounded-full bg-green-bright/20 blur-3xl" />
      <div className="relative grid md:grid-cols-[auto_1fr_auto] gap-5 items-center">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/60">Seu ID de agente</div>
          <div className="text-4xl font-extrabold tracking-tight tabular-nums mt-1">{code}</div>
        </div>
        <div className="text-sm text-white/75 leading-relaxed">
          <p>O cliente informa este ID no cadastro, ou entra pelo seu link e já vem com a indicação preenchida.</p>
          <code className="block mt-2 text-xs text-white/90 break-all"><Link2 size={12} className="inline mr-1" />{url}</code>
        </div>
        <div className="flex md:flex-col gap-2 md:w-44">
          <CopyButton text={code} label="Copiar ID" done="ID copiado!" />
          <CopyButton text={url} label="Copiar link" done="Link copiado!" />
        </div>
      </div>
    </div>
  );
}
