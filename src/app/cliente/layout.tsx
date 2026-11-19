import { requireRole } from "@/lib/auth";
import { AppShell } from "@/components/shell";

export const dynamic = "force-dynamic";

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole(["client"], { mfa: false });
  return (
    <AppShell session={session} portalLabel="Portal do cliente" nav={[
      { href: "/cliente", label: "Início" },
      { href: "/cliente/credito", label: "Pedir crédito" },
      { href: "/cliente/cartao", label: "Cartão" },
      { href: "/cliente/recibos", label: "Recibos" },
      { href: "/cliente/pix", label: "Minha chave Pix" },
    ]}>{children}</AppShell>
  );
}
