import type { ReactNode } from "react";

export const LEGAL = {
  controller: "Nathalia Oliveira da Conceição de Lira",
  email: "nathalia.oliveira.conceicao@gmail.com",
  forum: "Itaboraí/RJ",
  updated: "23 de outubro de 2026",
} as const;

/** Moldura comum das páginas jurídicas (termos e privacidade). */
export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl space-y-6 text-[15px] leading-relaxed [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1" data-testid="pagina-legal">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted">Última atualização: {LEGAL.updated}</p>
      </header>
      {children}
    </article>
  );
}
