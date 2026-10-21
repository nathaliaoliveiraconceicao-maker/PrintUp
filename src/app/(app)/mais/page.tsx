import Link from "next/link";
import { ArrowRight, History, Layers, Printer, Settings } from "lucide-react";
import { PageHeader } from "@/components/ui/card";

export const metadata = { title: "Mais" };

const LINKS = [
  { href: "/impressoras", label: "Impressoras", detail: "Custo e potência de cada máquina", icon: Printer },
  { href: "/filamentos", label: "Filamentos", detail: "Preço por kg dos seus materiais", icon: Layers },
  { href: "/configuracoes", label: "Custos e margens", detail: "Custos fixos, energia, taxas, impostos", icon: Settings },
  { href: "/historico", label: "Histórico", detail: "Últimas operações na conta", icon: History },
];

export default function MorePage() {
  return (
    <>
      <PageHeader title="Mais" />
      <ul className="space-y-3">
        {LINKS.map(({ href, label, detail, icon: Icon }) => (
          <li key={href}>
            <Link href={href} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 hover:border-accent">
              <Icon size={20} className="text-accent" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{label}</span>
                <span className="block truncate text-sm text-muted">{detail}</span>
              </span>
              <ArrowRight size={16} className="text-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
