import { requireRole } from "@/lib/auth";
import { AppShell } from "@/components/shell";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole(["admin"], { mfa: true });
  const nav = [
    { href: "/admin", label: "Painel" },
    { href: "/admin/propostas", label: "Aprovações" },
    { href: "/admin/desembolsos", label: "Desembolsos" },
    { href: "/admin/cobranca", label: "Fila de cobrança" },
    { href: "/admin/conciliacao", label: "Conciliação" },
    { href: "/admin/produtos", label: "Catálogo" },
    { href: "/admin/agentes", label: "Agentes" },
    { href: "/admin/configuracoes", label: "Configurações" },
    { href: "/admin/cartao", label: "Cartão" },
    { href: "/admin/auditoria", label: "Auditoria" },
  ];
  if (env.isSandbox) nav.push({ href: "/admin/sandbox", label: "Sandbox" });
  return <AppShell session={session} portalLabel="Administração" nav={nav}>{children}</AppShell>;
}
