import Image from "next/image";
import { Alert } from "@/components/ui";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function EntrarPage({ searchParams }: { searchParams: Promise<{ next?: string; erro?: string; ok?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="min-h-dvh grid lg:grid-cols-[1.1fr_1fr]">
      <section className="brand-mesh text-white relative overflow-hidden flex flex-col justify-between p-8 md:p-12 min-h-[38vh]">
        <div aria-hidden className="absolute -right-40 -top-40 w-[640px] h-[640px]">
          <span className="orbit inset-0" />
          <span className="orbit inset-16" style={{ animationDuration: "28s", animationDirection: "reverse" }} />
          <span className="orbit inset-32" style={{ animationDuration: "18s" }} />
        </div>
        <div className="relative rise">
          <div className="inline-flex rounded-2xl bg-white px-4 py-3"><Image src="/logo-wc.png" alt="WorldCred" width={180} height={60} priority className="h-9 w-auto" /></div>
        </div>
        <div className="relative max-w-md">
          <h1 className="rise rise-d1 text-3xl md:text-5xl font-extrabold leading-[1.05] tracking-tight">Crédito com fluxo claro, do aceite ao recibo.</h1>
          <p className="rise rise-d2 mt-4 text-white/75 text-base md:text-lg leading-relaxed">Proposta, aceite, desembolso Pix e cobrança automática em um só lugar. Cada etapa registrada, cada centavo conciliado.</p>
          <ul className="rise rise-d3 mt-6 grid grid-cols-3 gap-3 text-xs text-white/70">
            <li className="rounded-xl bg-white/5 ring-1 ring-white/10 p-3"><div className="text-xl font-bold text-white">Pix</div>crédito na conta em minutos</li>
            <li className="rounded-xl bg-white/5 ring-1 ring-white/10 p-3"><div className="text-xl font-bold text-white">Parcelas fixas</div>valor claro, sem surpresas</li>
            <li className="rounded-xl bg-white/5 ring-1 ring-white/10 p-3"><div className="text-xl font-bold text-white">Portal 24h</div>acompanhe e pague quando quiser</li>
          </ul>
        </div>
        <p className="relative text-xs text-white/50 rise rise-d4">World Serviços de Crédito LTDA · CNPJ 35.850.108/0001-58</p>
      </section>
      <section className="flex items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-sm rise rise-d2">
          <h2 className="text-2xl font-bold text-navy">Entrar</h2>
          <p className="text-sm text-muted mt-1 mb-6">Portal do agente, do cliente e administrativo.</p>
          {sp.erro && <div className="mb-3"><Alert kind="danger">{sp.erro === "inativo" ? "Seu acesso está inativo." : sp.erro}</Alert></div>}
          {sp.ok && <div className="mb-3"><Alert kind="success">Acesso criado. Entre com seu e-mail e senha.</Alert></div>}
          <LoginForm next={sp.next ?? ""} />
          <p className="text-xs text-muted mt-6">Recebeu um convite por SMS? Use o link enviado para criar seu acesso.</p>
        </div>
      </section>
    </div>
  );
}
