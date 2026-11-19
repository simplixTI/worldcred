import { redirect } from "next/navigation";
import { requireRole, isDev } from "@/lib/auth";
import { AppShell } from "@/components/shell";

export const dynamic = "force-dynamic";

/** Painel DEV: só para administradores listados em DEV_EMAILS. */
export default async function DevLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole(["admin"], { mfa: true });
  if (!isDev(session)) redirect("/admin");
  return (
    <AppShell session={session} portalLabel="Painel DEV" nav={[
      { href: "/dev", label: "Ambiente" },
      { href: "/dev/auditoria", label: "Auditoria" },
      { href: "/dev/sandbox", label: "Sandbox" },
      { href: "/admin", label: "← Admin" },
    ]}>{children}</AppShell>
  );
}
