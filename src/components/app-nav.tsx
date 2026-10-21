"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calculator, FileUp, Home, Layers, Package, Printer, Settings, History, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; icon: typeof Home; also?: string[] };

const SIDE: Item[] = [
  { href: "/", label: "Início", icon: Home },
  { href: "/importar", label: "Importar", icon: FileUp },
  { href: "/calculadora", label: "Calculadora", icon: Calculator },
  { href: "/produtos", label: "Produtos", icon: Package },
  { href: "/impressoras", label: "Impressoras", icon: Printer },
  { href: "/filamentos", label: "Filamentos", icon: Layers },
  { href: "/configuracoes", label: "Custos", icon: Settings },
  { href: "/historico", label: "Histórico", icon: History },
];

// No celular cabem 5 itens; o resto fica em "Mais".
const BOTTOM: Item[] = [
  { href: "/", label: "Início", icon: Home },
  { href: "/importar", label: "Importar", icon: FileUp },
  { href: "/calculadora", label: "Calculadora", icon: Calculator },
  { href: "/produtos", label: "Produtos", icon: Package },
  { href: "/mais", label: "Mais", icon: MoreHorizontal, also: ["/impressoras", "/filamentos", "/configuracoes", "/historico"] },
];

const isActive = (path: string, { href, also = [] }: Item) =>
  href === "/" ? path === "/" : [href, ...also].some((h) => path.startsWith(h));

export function SideNav() {
  const path = usePathname();
  return (
    <nav aria-label="Principal" className="space-y-1">
      {SIDE.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={isActive(path, item) ? "page" : undefined}
          className={cn(
            "flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium",
            isActive(path, item) ? "bg-accent-soft text-accent-strong" : "text-muted hover:bg-paper hover:text-ink",
          )}
        >
          <item.icon size={18} />
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function BottomNav() {
  const path = usePathname();
  return (
    <nav aria-label="Principal" className="fixed inset-x-0 bottom-0 z-20 grid h-16 grid-cols-5 border-t border-line bg-surface lg:hidden">
      {BOTTOM.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={isActive(path, item) ? "page" : undefined}
          className={cn("flex flex-col items-center justify-center gap-0.5 text-[11px]", isActive(path, item) ? "text-accent-strong" : "text-muted")}
        >
          <item.icon size={20} />
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
