"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calculator, Home, Layers, Printer, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/", label: "Início", icon: Home },
  { href: "/calculadora", label: "Calculadora", icon: Calculator },
  { href: "/impressoras", label: "Impressoras", icon: Printer },
  { href: "/filamentos", label: "Filamentos", icon: Layers },
  { href: "/configuracoes", label: "Custos", icon: Settings },
];

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path.startsWith(href));

export function SideNav() {
  const path = usePathname();
  return (
    <nav aria-label="Principal" className="space-y-1">
      {ITEMS.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(path, href) ? "page" : undefined}
          className={cn(
            "flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium",
            isActive(path, href) ? "bg-accent-soft text-accent-strong" : "text-muted hover:bg-paper hover:text-ink",
          )}
        >
          <Icon size={18} />
          {label}
        </Link>
      ))}
    </nav>
  );
}

export function BottomNav() {
  const path = usePathname();
  return (
    <nav aria-label="Principal" className="fixed inset-x-0 bottom-0 z-20 grid h-16 grid-cols-5 border-t border-line bg-surface lg:hidden">
      {ITEMS.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(path, href) ? "page" : undefined}
          className={cn("flex flex-col items-center justify-center gap-0.5 text-[11px]", isActive(path, href) ? "text-accent-strong" : "text-muted")}
        >
          <Icon size={20} />
          {label}
        </Link>
      ))}
    </nav>
  );
}
