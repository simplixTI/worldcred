import Link from "next/link";
import { PageTitle, Alert } from "@/components/ui";
import { syncCardPayment } from "@/lib/services/card";

export default async function CartaoRetorno({ searchParams }: { searchParams: Promise<{ status?: string; payment_id?: string; collection_status?: string }> }) {
  const sp = await searchParams;
  let synced: Record<string, unknown> | null = null;
  if (sp.payment_id) { try { synced = (await syncCardPayment(sp.payment_id)) as Record<string, unknown>; } catch { synced = null; } }
  const ok = sp.status === "success" || sp.collection_status === "approved";
  return (
    <>
      <PageTitle title="Retorno do pagamento" />
      {ok ? <Alert kind="success">Pagamento no cartão aprovado{synced?.outcome === "approved" ? " e registrado" : ""}. Agora a WorldCred confere a liberação e envia o valor líquido para a sua chave Pix. Você acompanha o status em “Cartão”.</Alert>
        : sp.status === "pending" ? <Alert kind="warn">Pagamento em análise pela operadora do cartão. Assim que for aprovado, avisamos e seguimos com o Pix.</Alert>
        : <Alert kind="danger">O pagamento não foi concluído. Você pode tentar novamente com outro cartão.</Alert>}
      <div className="mt-4 flex gap-2"><Link href="/cliente/cartao" className="btn-primary">Ver minhas operações</Link><Link href="/cliente" className="btn-outline">Início</Link></div>
    </>
  );
}
