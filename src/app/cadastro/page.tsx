import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getLoanSettings } from "@/lib/services/loan";
import { SignupWizard } from "./wizard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Cadastro · WorldCred" };

export default async function CadastroPage({ searchParams }: { searchParams: Promise<{ ref?: string; valor?: string; prazo?: string }> }) {
  const sp = await searchParams;
  const limits = await getLoanSettings();
  let agentFirstName: string | null = null;
  if (sp.ref) {
    const supabase = await createClient();
    const { data } = await supabase.rpc("wc_public_agent", { p_code: sp.ref });
    agentFirstName = (data as { first_name?: string } | null)?.first_name ?? null;
  }
  return (
    <div className="min-h-dvh bg-bg">
      <header className="brand-mesh text-white">
        <div className="mx-auto max-w-3xl px-4 h-16 flex items-center justify-between">
          <Link href="/" aria-label="WorldCred"><Image src="/logo-wc-white.png" alt="WorldCred" width={126} height={42} priority className="h-8 w-auto" /></Link>
          <Link href="/entrar" className="text-sm text-white/80 hover:text-white">Já tenho conta</Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8 md:py-12">
        <SignupWizard limits={limits} rate={limits.monthly_rate} initialRef={sp.ref ?? ""} agentFirstName={agentFirstName} initialPrincipal={Number(sp.valor) || 0} initialTerm={Number(sp.prazo) || 0} />
      </main>
      <footer className="text-center text-xs text-muted py-6">World Serviços de Crédito LTDA · CNPJ 35.850.108/0001-58</footer>
    </div>
  );
}
