import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin/ofertas", label: "Visão geral e regras" },
  { href: "/admin/ofertas/revisao", label: "Revisão e publicadas" },
  { href: "/admin/ofertas/lojas", label: "Lojas, fontes e cupons" },
  { href: "/admin/ofertas/execucoes", label: "Execuções e erros" },
  { href: "/admin/ofertas/afiliados", label: "Afiliados e cliques" },
] as const;

export function OffersAdminTabs({ current }: { current: (typeof TABS)[number]["href"] }) {
  return (
    <nav aria-label="Ofertas" className="-mx-1 mb-6 flex gap-2 overflow-x-auto px-1 pb-1">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} aria-current={t.href === current ? "page" : undefined} className={cn("flex h-10 shrink-0 items-center rounded-full border px-4 text-sm", t.href === current ? "border-dark bg-dark font-medium text-on-dark" : "border-line bg-surface text-muted hover:text-ink")}>{t.label}</Link>
      ))}
    </nav>
  );
}
