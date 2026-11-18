"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";

export function NavTabs({ items }: { items: { href: string; label: string }[] }) {
  const path = usePathname();
  const active = items.reduce<string | null>((best, n) => (path === n.href || (n.href !== items[0].href && path.startsWith(n.href)) ? (best && best.length > n.href.length ? best : n.href) : best), items[0]?.href === path ? items[0].href : null);
  return (
    <nav className="mx-auto max-w-6xl px-2 flex gap-1 overflow-x-auto [scrollbar-width:none]" aria-label="Seções">
      {items.map((n) => {
        const isActive = active === n.href || (!active && n.href === items[0].href && path.startsWith(n.href));
        return (
          <Link key={n.href} href={n.href} aria-current={isActive ? "page" : undefined}
            className={`relative whitespace-nowrap px-3 py-2.5 text-sm font-medium transition-colors ${isActive ? "text-white" : "text-white/60 hover:text-white"}`}>
            {n.label}
            {isActive && <motion.span layoutId="wc-nav-underline" className="absolute left-2 right-2 -bottom-px h-0.5 rounded-full bg-green-bright" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
          </Link>
        );
      })}
    </nav>
  );
}
