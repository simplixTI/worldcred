import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Kpi, PageTitle } from "@/components/ui";
import { Stagger, Item } from "@/components/motion";
import { ReferralCard } from "./referral-card";
import { env } from "@/lib/env";
import { UserPlus, FileText, Briefcase } from "lucide-react";

export default async function AgentHome() {
  const s = await requireRole(["agent"], { mfa: false });
  const db = await createClient();
  const { data: me } = await db.from("profiles").select("referral_slug").eq("id", s.userId).maybeSingle();
  const [{ count: customers }, { count: pending }, { data: contracts }] = await Promise.all([
    db.from("agent_customers").select("customer_id", { count: "exact", head: true }),
    db.from("proposals").select("id", { count: "exact", head: true }).in("status", ["sent", "accepted"]),
    db.from("contracts").select("principal_cents, status").eq("status", "active"),
  ]);
  const active = contracts ?? [];
  const tiles = [
    { href: "/agente/clientes/novo", title: "Novo cliente", desc: "Cadastre nome, CPF e contato e convide para o portal", Icon: UserPlus },
    { href: "/agente/propostas", title: "Minhas propostas", desc: "Simule, envie e acompanhe o aceite", Icon: FileText },
    { href: "/agente/carteira", title: "Minha carteira", desc: "Clientes, contratos ativos e parcelas", Icon: Briefcase },
  ];
  return (
    <>
      <PageTitle title={`Olá, ${s.fullName.split(" ")[0]}`} subtitle="O que você quer fazer hoje?" />
      <Stagger className="grid gap-3 sm:grid-cols-3 mb-6">
        {tiles.map((t) => (
          <Item key={t.href}>
            <Link href={t.href} className="card p-5 block h-full group transition-[transform,border-color,box-shadow] duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1 hover:border-green/60 hover:shadow-[0_18px_36px_-20px_rgba(15,122,90,0.45)]">
              <span className="grid place-items-center w-11 h-11 rounded-xl bg-green-soft text-green mb-4 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-[-4deg]"><t.Icon className="w-5 h-5" /></span>
              <div className="font-bold text-navy text-lg">{t.title}</div>
              <div className="text-sm text-muted mt-1 leading-relaxed">{t.desc}</div>
              <div className="mt-3 text-sm font-semibold text-green opacity-0 -translate-x-1 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0">Abrir →</div>
            </Link>
          </Item>
        ))}
      </Stagger>
      <Stagger className="grid gap-3 grid-cols-2 sm:grid-cols-3" delay={0.2}>
        <Item><Kpi label="Clientes na carteira" value={customers ?? 0} href="/agente/carteira" /></Item>
        <Item><Kpi label="Propostas em andamento" value={pending ?? 0} href="/agente/propostas" /></Item>
        <Item><Kpi label="Principal ativo" cents={active.reduce((a, c) => a + Number(c.principal_cents), 0)} hint={`${active.length} contrato(s) ativo(s)`} href="/agente/carteira" /></Item>
      </Stagger>
      {me?.referral_slug && <div className="mt-6"><ReferralCard url={`${env.appUrl}/a/${me.referral_slug}`} /></div>}
    </>
  );
}
