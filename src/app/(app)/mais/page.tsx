import Link from "next/link";
import { ArrowRight, Boxes, ClipboardList, FileUp, History, Layers, Printer, Settings, Sparkles, Store } from "lucide-react";
import { PageHeader } from "@/components/ui/card";

export const metadata = { title: "Mais" };

const LINKS = [
  { href: "/importar", label: "Importar modelo", detail: "3MF, G-code ou entrada manual", icon: FileUp },
  { href: "/impressoras", label: "Impressoras", detail: "Custo e potência de cada máquina", icon: Printer },
  { href: "/filamentos", label: "Filamentos", detail: "Preço por kg dos seus materiais", icon: Layers },
  { href: "/configuracoes", label: "Configurações", detail: "Custos fixos, energia, taxas, impostos, margem", icon: Settings },
  { href: "/negocio", label: "Meu negócio", detail: "Logo, contato e padrões dos orçamentos em PDF", icon: Store },
  { href: "/historico", label: "Histórico", detail: "Últimas operações na conta", icon: History },
  { href: "/boas-vindas?refazer=1", label: "Configuração guiada", detail: "Rever impressora, filamento e margem passo a passo", icon: Sparkles },
];

export default function MorePage() {
  return (
    <>
      <PageHeader title="Mais" />
      <ul className="space-y-3">
        {LINKS.map(({ href, label, detail, icon: Icon }) => (
          <li key={href}>
            <Link href={href} className="flex min-h-16 items-center gap-3 rounded-2xl border border-line bg-surface p-4 hover:border-accent">
              <Icon size={20} className="text-accent-strong" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{label}</span>
                <span className="block truncate text-sm text-muted">{detail}</span>
              </span>
              <ArrowRight size={16} className="text-muted" />
            </Link>
          </li>
        ))}
      </ul>
      <h2 className="mb-2 mt-8 text-sm font-semibold uppercase tracking-wide text-muted">Em breve</h2>
      <ul className="space-y-3">
        {[{ label: "Pedidos", detail: "Transformar orçamentos aprovados em pedidos", icon: ClipboardList }, { label: "Estoque", detail: "Controle de carretéis e peças prontas", icon: Boxes }].map(({ label, detail, icon: Icon }) => (
          <li key={label} className="flex items-center gap-3 rounded-2xl border border-dashed border-line p-4 text-muted">
            <Icon size={20} aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{label}</span>
              <span className="block truncate text-sm">{detail}</span>
            </span>
            <span className="rounded-full bg-line px-2 py-0.5 text-xs font-medium">em breve</span>
          </li>
        ))}
      </ul>
    </>
  );
}
