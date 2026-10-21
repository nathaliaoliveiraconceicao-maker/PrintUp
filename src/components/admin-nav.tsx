"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, BarChart3, FileClock, Gauge, Settings, Tags, Ticket, Users, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/admin", label: "Visão geral", icon: Gauge, exact: true },
  { href: "/admin/usuarios", label: "Usuários", icon: Users },
  { href: "/admin/assinaturas", label: "Assinaturas", icon: Wallet },
  { href: "/admin/planos", label: "Planos", icon: Tags },
  { href: "/admin/cupons", label: "Cupons", icon: Ticket },
  { href: "/admin/uso", label: "Uso", icon: BarChart3 },
  { href: "/admin/monitoramento", label: "Monitoramento", icon: Activity },
  { href: "/admin/auditoria", label: "Auditoria", icon: FileClock },
  { href: "/admin/configuracoes", label: "Configurações", icon: Settings },
];

export function AdminNav() {
  const path = usePathname();
  return (
    <nav aria-label="Administração" className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
      {ITEMS.map((i) => {
        const active = i.exact ? path === i.href : path.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active ? "page" : undefined}
            className={cn("flex h-11 shrink-0 items-center gap-3 rounded-xl px-3 text-sm font-medium", active ? "bg-ink text-paper" : "text-muted hover:bg-paper hover:text-ink")}
          >
            <i.icon size={18} aria-hidden="true" />
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
