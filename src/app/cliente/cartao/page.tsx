import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCardSettings, quoteCard } from "@/lib/services/card";
import { PageTitle, Alert, StatusBadge, Money, Empty } from "@/components/ui";
import { formatDateTimeBR } from "@/lib/finance/dates";
import { CardQuote } from "./quote";

const LABEL: Record<string, string> = { draft: "Aguardando pagamento", authorized: "Cartão aprovado", settled: "Liberado", disbursed: "Pix enviado", disputed: "Em contestação", cancelled: "Cancelada" };

export default async function ClienteCartao() {
  const cfg = await getCardSettings();
  const db = await createClient();
  const [{ data: me }, { data: ops }] = await Promise.all([
    db.from("customers").select("pix_key_status").maybeSingle(),
    db.from("card_operations").select("*").order("created_at", { ascending: false }).limit(10),
  ]);
  const amounts = [100000, 200000, 300000, 500000, 1000000].filter((a) => a >= cfg.min_cents && a <= cfg.max_cents);
  const quotes = amounts.flatMap((a) => Array.from({ length: cfg.max_installments }, (_, i) => i + 1).map((n) => { const q = quoteCard(a, n, cfg.monthly_rate); return { net: a, n, installment: q.installment_cents, last: q.last_installment_cents, gross: q.gross_cents, fees: q.fees_cents, cet: q.cet_monthly }; }));
  return (
    <>
      <PageTitle title="Crédito com o cartão" subtitle="Você paga no cartão em parcelas e recebe o valor líquido via Pix, sem sair do portal. O cartão é processado pelo Mercado Pago." />
      {!cfg.live ? <Alert kind="warn">Esta modalidade ainda não está disponível. Avisaremos quando for liberada.</Alert> : me?.pix_key_status !== "validated" ? (
        <Alert kind="warn">Cadastre e valide sua chave Pix antes de contratar. <Link href="/cliente/pix" className="underline font-semibold">Cadastrar chave Pix</Link></Alert>
      ) : (
        <CardQuote amounts={amounts} maxInstallments={cfg.max_installments} rate={cfg.monthly_rate} quotes={quotes} publicKey={process.env.NEXT_PUBLIC_MP_PUBLIC_KEY ?? null} />
      )}
      <h2 className="font-bold text-navy text-lg mt-8 mb-2">Minhas operações</h2>
      {!ops?.length ? <Empty>Nenhuma operação com cartão ainda.</Empty> : (
        <div className="card overflow-x-auto"><table className="table"><thead><tr><th>Quando</th><th>Você recebe</th><th>No cartão</th><th>Situação</th><th></th></tr></thead>
          <tbody>{ops.map((o) => <tr key={o.id}><td className="text-xs text-muted">{formatDateTimeBR(o.created_at)}</td><td><Money cents={o.net_pix_cents} /></td><td>{o.installments}x <Money cents={o.installment_cents} /></td><td><StatusBadge status={o.status} overrideLabel={LABEL[o.status] ?? o.status} /></td><td>{o.status === "draft" && o.checkout_url && <a href={o.checkout_url} className="btn-green !py-1.5 !px-3 text-xs">Pagar agora</a>}</td></tr>)}</tbody></table></div>
      )}
    </>
  );
}
