import { requireRole, isDev } from "@/lib/auth";
import { AppShell } from "@/components/shell";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole(["admin"], { mfa: true });
  const nav = [
    { href: "/admin", label: "Painel" },
    { href: "/admin/leads", label: "Leads" },
    { href: "/admin/propostas", label: "Aprovações" },
    { href: "/admin/desembolsos", label: "Desembolsos" },
    { href: "/admin/cobranca", label: "Fila de cobrança" },
    { href: "/admin/conciliacao", label: "Conciliação" },
    { href: "/admin/produtos", label: "Catálogo (legado)" },
    { href: "/admin/agentes", label: "Agentes" },
    { href: "/admin/configuracoes", label: "Configurações" },
    { href: "/admin/cartao", label: "Cartão" },
  ];
  if (isDev(session)) nav.push({ href: "/dev", label: "Dev" });
  return <AppShell session={session} portalLabel="Administração" nav={nav}>{children}</AppShell>;
}
