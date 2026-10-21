"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Boxes, Calculator, ClipboardList, FileText, FileUp, Home, KanbanSquare, Layers, MoreHorizontal, Package, Printer, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; icon: typeof Home; also?: string[] };

export const MAIN_NAV: Item[] = [
  { href: "/", label: "Painel", icon: Home },
  { href: "/calculadora", label: "Nova precificação", icon: Calculator },
  { href: "/importar", label: "Importar modelo", icon: FileUp },
  { href: "/produtos", label: "Meus produtos", icon: Package },
  { href: "/orcamentos", label: "Orçamentos", icon: FileText },
  { href: "/pedidos", label: "Pedidos", icon: ClipboardList },
  { href: "/producao", label: "Produção", icon: KanbanSquare },
  { href: "/estoque", label: "Estoque", icon: Boxes },
  { href: "/impressoras", label: "Impressoras", icon: Printer },
  { href: "/filamentos", label: "Filamentos", icon: Layers },
  { href: "/configuracoes", label: "Configurações", icon: Settings, also: ["/negocio", "/historico", "/boas-vindas", "/assinatura"] },
];

/** Módulos planejados: aparecem só como aviso, sem link, para não parecerem disponíveis. */
export const FUTURE_NAV: readonly { label: string; icon: typeof Home }[] = [];

// No celular cabem 5 itens; o resto fica em "Mais".
const BOTTOM: Item[] = [
  { href: "/", label: "Painel", icon: Home },
  { href: "/calculadora", label: "Precificar", icon: Calculator },
  { href: "/orcamentos", label: "Orçamentos", icon: FileText },
  { href: "/pedidos", label: "Pedidos", icon: ClipboardList },
  { href: "/producao", label: "Produção", icon: KanbanSquare },
  { href: "/mais", label: "Mais", icon: MoreHorizontal, also: ["/produtos", "/estoque", "/importar", "/impressoras", "/filamentos", "/configuracoes", "/negocio", "/historico", "/boas-vindas", "/assinatura"] },
];

const isActive = (path: string, { href, also = [] }: Item) =>
  href === "/" ? path === "/" : [href, ...also].some((h) => path.startsWith(h));

export function SideNav() {
  const path = usePathname();
  return (
    <nav aria-label="Principal" className="space-y-1">
      {MAIN_NAV.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={isActive(path, item) ? "page" : undefined}
          className={cn(
            "flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium",
            isActive(path, item) ? "bg-ink text-paper" : "text-muted hover:bg-paper hover:text-ink",
          )}
        >
          <item.icon size={18} />
          {item.label}
        </Link>
      ))}
      {FUTURE_NAV.length > 0 && <div className="pt-4">
        <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted">Em breve</p>
        <ul>
          {FUTURE_NAV.map((f) => (
            <li key={f.label} className="flex h-10 items-center gap-3 rounded-xl px-3 text-sm text-muted/70">
              <f.icon size={18} aria-hidden="true" />
              {f.label}
              <span className="ml-auto rounded-full bg-line px-2 py-0.5 text-[10px] font-medium">em breve</span>
            </li>
          ))}
        </ul>
      </div>}
    </nav>
  );
}

export function BottomNav() {
  const path = usePathname();
  return (
    <nav aria-label="Principal" className="fixed inset-x-0 bottom-0 z-20 grid h-16 grid-cols-6 border-t border-line bg-surface lg:hidden">
      {BOTTOM.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={isActive(path, item) ? "page" : undefined}
          className={cn("flex min-h-11 flex-col items-center justify-center gap-0.5 text-[11px] font-medium", isActive(path, item) ? "text-accent-strong" : "text-muted")}
        >
          <item.icon size={20} />
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
