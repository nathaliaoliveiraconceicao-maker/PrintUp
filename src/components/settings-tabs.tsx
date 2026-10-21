import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/configuracoes", label: "Custos e margens" },
  { href: "/negocio", label: "Meu negócio" },
  { href: "/assinatura", label: "Minha assinatura" },
  { href: "/historico", label: "Histórico" },
  { href: "/boas-vindas?refazer=1", label: "Configuração guiada" },
] as const;

/** Abas do grupo "Configurações". */
export function SettingsTabs({ current }: { current: "/configuracoes" | "/negocio" | "/historico" | "/assinatura" }) {
  return (
    <nav aria-label="Configurações" className="-mx-1 mb-6 flex gap-2 overflow-x-auto px-1 pb-1">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.href === current ? "page" : undefined}
          className={cn("flex h-10 shrink-0 items-center rounded-full border px-4 text-sm", t.href === current ? "border-ink bg-ink font-medium text-paper" : "border-line bg-surface text-muted hover:text-ink")}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
