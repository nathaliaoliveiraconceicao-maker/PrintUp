import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/filamentos", label: "Meus filamentos" },
  { href: "/filamentos/estoque", label: "Estoque de bobinas" },
] as const;

/** Abas do grupo "Filamentos": o cadastro e o estoque de bobinas ficam juntos. */
export function FilamentTabs({ current }: { current: (typeof TABS)[number]["href"] }) {
  return (
    <nav aria-label="Filamentos" className="-mx-1 mb-6 flex gap-2 overflow-x-auto px-1 pb-1">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} aria-current={t.href === current ? "page" : undefined}
          className={cn("flex h-10 shrink-0 items-center rounded-full border px-4 text-sm", t.href === current ? "border-ink bg-ink font-medium text-paper" : "border-line bg-surface text-muted hover:text-ink")}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
