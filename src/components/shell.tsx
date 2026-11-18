import Link from "next/link";
import Image from "next/image";
import { signOut } from "@/app/(auth)/actions";
import type { SessionInfo } from "@/lib/auth";
import { NavTabs } from "./nav-tabs";
import { PageEnter } from "./motion";
import { ShieldCheck, ShieldAlert, LogOut } from "lucide-react";

export interface NavItem { href: string; label: string; }

export function AppShell({ session, nav, children, portalLabel }: { session: SessionInfo; nav: NavItem[]; children: React.ReactNode; portalLabel: string }) {
  const initials = session.fullName.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
  return (
    <div className="min-h-dvh flex flex-col">
      <header className="brand-mesh text-white sticky top-0 z-20 shadow-[0_8px_30px_-18px_rgba(6,16,46,0.9)]">
        <div className="mx-auto max-w-6xl px-4 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link href={nav[0]?.href ?? "/"} className="shrink-0 flex items-center" aria-label="WorldCred — início">
              <Image src="/logo-wc-white.png" alt="WorldCred" width={126} height={42} priority className="h-8 w-auto" />
            </Link>
            <span className="hidden sm:inline text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70 border-l border-white/15 pl-3">{portalLabel}</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 text-sm min-w-0">
            {session.role !== "client" && (
              <span className={`badge gap-1 ${session.aal === "aal2" ? "bg-green-bright/20 text-green-soft" : "bg-warn-soft/20 text-amber-200"}`} title="Nível de autenticação">
                {session.aal === "aal2" ? <ShieldCheck size={13} /> : <ShieldAlert size={13} />}{session.aal === "aal2" ? "MFA" : "sem MFA"}
              </span>
            )}
            <span className="flex items-center gap-2 min-w-0">
              <span className="grid place-items-center w-8 h-8 rounded-full bg-white/10 text-xs font-bold ring-1 ring-white/15" aria-hidden>{initials}</span>
              <span className="truncate text-white/80 hidden md:inline max-w-40">{session.fullName}</span>
            </span>
            <form action={signOut}><button className="btn !px-3 !py-1.5 bg-white/10 text-white hover:bg-white/20 ring-1 ring-white/15" aria-label="Sair"><LogOut size={14} /><span className="hidden sm:inline">Sair</span></button></form>
          </div>
        </div>
        <NavTabs items={nav} />
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-6 md:py-8 flex-1"><PageEnter>{children}</PageEnter></main>
      <footer className="text-center text-xs text-muted py-5">World Serviços de Crédito LTDA · CNPJ 35.850.108/0001-58</footer>
    </div>
  );
}
