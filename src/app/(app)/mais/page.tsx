import Link from "next/link";
import { ArrowRight, Boxes, FileUp, History, Layers, Package, Printer, Settings, Sparkles, Store } from "lucide-react";
import { PageHeader } from "@/components/ui/card";

export const metadata = { title: "Mais" };

const LINKS = [
  { href: "/produtos", label: "Meus produtos", detail: "Catálogo com custo, preço e estoque de peças", icon: Package },
  { href: "/estoque", label: "Estoque de filamento", detail: "Bobinas, saldo e material reservado", icon: Boxes },
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
    </>
  );
}
