import { createClient } from "@/lib/supabase/server";
import { PageTitle, StatusBadge, Alert } from "@/components/ui";
import { maskPixKey } from "@/lib/utils/mask";
import { PixKeyForm } from "./form";

export default async function PixKeyPage() {
  const db = await createClient();
  const { data: c } = await db.from("customers").select("pix_key, pix_key_type, pix_key_status, pix_key_validation").maybeSingle();
  const v = c?.pix_key_validation as { owner_name?: string; reason?: string; at?: string } | null;
  return (
    <div className="max-w-lg">
      <PageTitle title="Minha chave Pix" subtitle="É nesta chave que o crédito será depositado. A titularidade é confirmada pelo parceiro Pix." />
      <div className="card p-5 space-y-4">
        {c?.pix_key && (
          <div className="text-sm"><span className="text-muted">Chave atual:</span> <span className="font-mono">{maskPixKey(c.pix_key)}</span> <StatusBadge status={c.pix_key_status} />
            {v?.owner_name && c.pix_key_status === "validated" && <div className="text-xs text-muted mt-1">Titular: {v.owner_name}</div>}
            {v?.reason && c.pix_key_status === "rejected" && <div className="mt-2"><Alert kind="danger">{v.reason}</Alert></div>}
          </div>
        )}
        <PixKeyForm />
        <p className="text-xs text-muted">A chave deve ser de sua titularidade (mesmo CPF do cadastro). Chaves de terceiros são recusadas.</p>
      </div>
    </div>
  );
}
