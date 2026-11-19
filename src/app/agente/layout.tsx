import { requireRole } from "@/lib/auth";
import { AppShell } from "@/components/shell";

export const dynamic = "force-dynamic";

export default async function AgentLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole(["agent"], { mfa: false });
  return (
    <AppShell session={session} portalLabel="Portal do agente" nav={[
      { href: "/agente", label: "Minhas indicações" },
      { href: "/agente/propostas", label: "Propostas" },
      { href: "/agente/carteira", label: "Contratos" },
      { href: "/agente/casos", label: "Casos" },
    ]}>{children}</AppShell>
  );
}
