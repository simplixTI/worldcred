import { requireRole } from "@/lib/auth";
import { AppShell } from "@/components/shell";

export const dynamic = "force-dynamic";

export default async function AgentLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole(["agent"], { mfa: false });
  return (
    <AppShell session={session} portalLabel="Portal do agente" nav={[
      { href: "/agente", label: "Início" },
      { href: "/agente/clientes/novo", label: "Novo cliente" },
      { href: "/agente/propostas", label: "Minhas propostas" },
      { href: "/agente/carteira", label: "Minha carteira" },
      { href: "/agente/casos", label: "Meus casos" },
    ]}>{children}</AppShell>
  );
}
