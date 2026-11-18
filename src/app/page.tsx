import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getSession, homeFor } from "@/lib/auth";
import { buildSchedule } from "@/lib/finance/price";
import { Simulator, type SimProduct, type SimRow } from "@/components/landing/simulator";
import { LeadForm } from "@/components/landing/lead-form";
import { Stagger, Item } from "@/components/motion";
import { Zap, ShieldCheck, Smartphone, CreditCard, FileCheck2, BadgeCheck, QrCode, MessageSquareText } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "WorldCred · Crédito de R$ 1.000 a R$ 10.000 com Pix na conta",
  description: "Simule em segundos, aceite pelo celular e receba via Pix. Parcelas fixas, CET transparente e portal para acompanhar tudo.",
};

const FALLBACK = [100000, 200000, 300000, 500000, 1000000].map((p) => ({ principal_cents: p, monthly_rate: "0.15", allowed_terms: [3, 6, 10, 12], fee_cents: 0 }));

export default async function Landing({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const [session, { data: catalog }, agent] = await Promise.all([
    getSession().catch(() => null),
    supabase.rpc("wc_public_catalog"),
    sp.ref ? (async () => { const r = await supabase.rpc("wc_public_agent_name", { p_slug: sp.ref }); return (r.data as string | null) ?? null; })().catch(() => null) : Promise.resolve(null),
  ]);
  const rows = (catalog && catalog.length ? catalog : FALLBACK) as { principal_cents: number; monthly_rate: string; allowed_terms: number[]; fee_cents: number }[];
  const products: SimProduct[] = rows.map((r) => ({ principal: Number(r.principal_cents), terms: r.allowed_terms, rate: String(r.monthly_rate) })).sort((a, b) => a.principal - b.principal);
  const sims: SimRow[] = rows.flatMap((r) => r.allowed_terms.map((t) => {
    const s = buildSchedule({ principalCents: Number(r.principal_cents), monthlyRate: r.monthly_rate, termMonths: t, feeCents: Number(r.fee_cents) });
    return { principal: Number(r.principal_cents), term: t, installment: s.regular_installment_cents, last: s.last_installment_cents, total: s.total_cents, net: s.net_cents, cet_monthly: s.cet_monthly, cet_annual: s.cet_annual, annual: s.annual_rate };
  }));

  return (
    <div className="min-h-dvh bg-bg">
      <header className="absolute inset-x-0 top-0 z-20">
        <div className="mx-auto max-w-6xl px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center" aria-label="WorldCred"><Image src="/logo-wc-white.png" alt="WorldCred" width={126} height={42} priority className="h-8 w-auto" /></Link>
          <nav className="hidden md:flex items-center gap-6 text-sm text-white/80">
            <a href="#como-funciona" className="hover:text-white">Como funciona</a>
            <a href="#transparencia" className="hover:text-white">Transparência</a>
            <a href="#perguntas" className="hover:text-white">Perguntas</a>
          </nav>
          <Link href={session ? homeFor(session.role) : "/entrar"} className="btn bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/20 !py-2">{session ? "Meu portal" : "Entrar"}</Link>
        </div>
      </header>

      <section className="brand-mesh text-white relative overflow-hidden pt-28 pb-16 md:pb-24">
        <div aria-hidden className="absolute -left-48 -top-48 w-[720px] h-[720px]"><span className="orbit inset-0" /><span className="orbit inset-20" style={{ animationDuration: "26s", animationDirection: "reverse" }} /><span className="orbit inset-40" style={{ animationDuration: "16s" }} /></div>
        <div className="mx-auto max-w-6xl px-4 grid lg:grid-cols-[1.05fr_1fr] gap-10 items-center relative">
          <div>
            {agent && <div className="rise inline-flex items-center gap-2 rounded-full bg-white/10 ring-1 ring-white/20 px-3 py-1 text-xs mb-5"><BadgeCheck size={14} className="text-green-bright" /> Indicação de {agent}</div>}
            <h1 className="rise rise-d1 text-4xl md:text-6xl font-extrabold leading-[1.02] tracking-tight">Crédito de R$ 1.000 a R$ 10.000, <span className="text-green-bright">com Pix na conta</span>.</h1>
            <p className="rise rise-d2 mt-5 text-white/75 text-lg md:text-xl leading-relaxed max-w-xl">Simule em segundos, aceite pelo celular e receba direto na sua chave Pix. Parcelas que não mudam e um portal para acompanhar tudo.</p>
            <div className="rise rise-d3 mt-7 flex flex-wrap gap-3">
              <a href="#quero-credito" className="btn-green !px-6 !py-3 text-base">Quero crédito</a>
              <a href="#como-funciona" className="btn bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/20 !px-6 !py-3 text-base">Como funciona</a>
            </div>
            <ul className="rise rise-d4 mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/70">
              <li className="flex items-center gap-2"><Zap size={16} className="text-green-bright" /> Dinheiro via Pix</li>
              <li className="flex items-center gap-2"><ShieldCheck size={16} className="text-green-bright" /> CET transparente</li>
              <li className="flex items-center gap-2"><Smartphone size={16} className="text-green-bright" /> Tudo pelo celular</li>
            </ul>
          </div>
          <div className="rise rise-d2 text-ink"><Simulator products={products} sims={sims} /></div>
        </div>
      </section>

      <section id="como-funciona" className="mx-auto max-w-6xl px-4 py-16 md:py-24">
        <h2 className="text-3xl md:text-4xl font-extrabold text-navy max-w-2xl">Do pedido ao Pix, em quatro passos.</h2>
        <p className="text-muted mt-3 max-w-2xl text-lg">Sem papelada e sem fila. Você acompanha cada etapa pelo portal.</p>
        <Stagger className="mt-10 grid md:grid-cols-4 gap-4">
          {[
            { Icon: MessageSquareText, t: "Você pede", d: "Simula aqui, deixa seu contato e um agente WorldCred fala com você." },
            { Icon: FileCheck2, t: "Lê e aceita", d: "A proposta chega no seu portal com valor, parcelas, juros e CET. Aceite com um toque." },
            { Icon: QrCode, t: "Recebe via Pix", d: "Aprovado, o dinheiro cai na sua chave Pix. Chave do seu CPF, validada pelo banco." },
            { Icon: Smartphone, t: "Paga quando quiser", d: "Cada parcela tem QR Code e copia e cola. A baixa é automática." },
          ].map((s, i) => (
            <Item key={s.t}>
              <div className="card p-6 h-full relative overflow-hidden group hover:-translate-y-1 transition-transform duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]">
                <span className="absolute right-4 top-4 text-6xl font-extrabold text-navy/5 tabular-nums select-none" aria-hidden>{i + 1}</span>
                <span className="grid place-items-center w-11 h-11 rounded-xl bg-green-soft text-green mb-4 transition-transform duration-300 group-hover:scale-110"><s.Icon size={20} /></span>
                <h3 className="font-bold text-navy text-lg">{s.t}</h3>
                <p className="text-sm text-muted mt-1.5 leading-relaxed">{s.d}</p>
              </div>
            </Item>
          ))}
        </Stagger>
      </section>

      <section id="transparencia" className="bg-navy text-white">
        <div className="mx-auto max-w-6xl px-4 py-16 md:py-24 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <h2 className="text-3xl md:text-4xl font-extrabold">O que você vê é o que você paga.</h2>
            <p className="text-white/70 mt-4 text-lg leading-relaxed">Parcelas fixas pela Tabela Price, juros e CET exibidos antes do aceite, nenhuma tarifa escondida. As condições ficam congeladas no seu contrato: mudanças futuras no catálogo não afetam você.</p>
            <ul className="mt-6 space-y-3 text-white/85">
              {["Valor líquido que cai no Pix, parcela e total antes de aceitar", "Recibo de cada pagamento no portal", "Lembretes por SMS antes e depois do vencimento, sem ligações insistentes", "Seus dados protegidos: CPF e chave Pix mascarados, acesso só seu"].map((t) => (
                <li key={t} className="flex items-start gap-3"><BadgeCheck size={18} className="text-green-bright shrink-0 mt-0.5" /> <span>{t}</span></li>
              ))}
            </ul>
          </div>
          <div className="card text-ink p-6 md:p-8">
            <div className="flex items-center gap-3 mb-4"><span className="grid place-items-center w-11 h-11 rounded-xl bg-navy/10 text-navy"><CreditCard size={20} /></span><div><h3 className="font-bold text-navy text-lg">Crédito com o cartão</h3><span className="badge bg-warn-soft text-warn">em breve</span></div></div>
            <p className="text-muted leading-relaxed">Use o limite do seu cartão de crédito e receba o valor via Pix, pagando na fatura. Operação feita com parceiro oficial: seus dados de cartão nunca passam pela WorldCred.</p>
            <a href="#quero-credito" className="btn-outline mt-5">Avise-me quando lançar</a>
          </div>
        </div>
      </section>

      <section id="quero-credito" className="mx-auto max-w-6xl px-4 py-16 md:py-24 grid lg:grid-cols-[1fr_1.1fr] gap-10 items-start">
        <div>
          <h2 className="text-3xl md:text-4xl font-extrabold text-navy">Quero crédito</h2>
          <p className="text-muted mt-3 text-lg leading-relaxed">Deixe seus dados. Um agente WorldCred entra em contato pelo celular, confirma seu pedido e envia a proposta para você ler e aceitar no portal.</p>
          <div className="mt-6 grid grid-cols-3 gap-3 text-center">
            {[["R$ 1 mil", "a partir de"], ["R$ 10 mil", "até"], ["12x", "em até"]].map(([v, l]) => (
              <div key={v} className="card p-4"><div className="text-xs text-muted">{l}</div><div className="text-xl font-extrabold text-navy tabular-nums">{v}</div></div>
            ))}
          </div>
        </div>
        <LeadForm refSlug={sp.ref ?? null} agentName={agent} />
      </section>

      <section id="perguntas" className="mx-auto max-w-3xl px-4 pb-20">
        <h2 className="text-2xl md:text-3xl font-extrabold text-navy mb-6">Perguntas frequentes</h2>
        <div className="space-y-3">
          {[
            ["Preciso de conta em banco?", "Precisa de uma chave Pix no seu CPF. O dinheiro é enviado para ela e a titularidade é confirmada pelo banco antes do envio."],
            ["Quanto tempo leva?", "A simulação é imediata. Depois do aceite e da aprovação, o Pix é enviado e você recebe a confirmação no portal."],
            ["Como pago as parcelas?", "No portal, cada parcela tem um QR Code Pix e o código copia e cola. Assim que o banco confirma, a parcela é baixada automaticamente e o recibo aparece."],
            ["E se eu atrasar?", "Você recebe lembretes por SMS com o link direto para pagar. Se já pagou e ainda aparece em aberto, use o botão “Já paguei” que a cobrança pausa enquanto conferimos."],
            ["Quem é o credor?", "World Serviços de Crédito LTDA, CNPJ 35.850.108/0001-58. Todas as condições aparecem na proposta e ficam registradas no seu contrato."],
          ].map(([q, a]) => (
            <details key={q} className="card p-5 group"><summary className="cursor-pointer font-semibold text-navy list-none flex items-center justify-between">{q}<span className="text-green transition-transform group-open:rotate-45 text-xl leading-none">+</span></summary><p className="text-muted mt-3 leading-relaxed">{a}</p></details>
          ))}
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-8 flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-muted">
          <Image src="/logo-wc.png" alt="WorldCred" width={110} height={36} className="h-6 w-auto" />
          <span>World Serviços de Crédito LTDA · CNPJ 35.850.108/0001-58</span>
          <Link href="/entrar" className="underline">Área do agente e do cliente</Link>
        </div>
      </footer>
    </div>
  );
}
