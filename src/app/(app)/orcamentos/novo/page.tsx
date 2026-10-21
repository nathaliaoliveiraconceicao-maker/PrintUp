import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, PageHeader } from "@/components/ui/card";
import { QuoteEditor } from "@/features/quotes/quote-editor";
import { loadEditorData } from "@/features/quotes/server";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Novo orçamento" };

export default async function NewQuotePage({ searchParams }: { searchParams: Promise<{ produto?: string }> }) {
  const { produto } = await searchParams;
  const supabase = await createClient();
  const data = await loadEditorData(supabase);
  return (
    <>
      <Link href="/orcamentos" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft size={14} /> Orçamentos</Link>
      <PageHeader title="Novo orçamento" />
      {!data.hasBusiness && (
        <Card className="mb-4 text-sm" data-testid="aviso-negocio">
          O PDF leva a identidade do seu negócio (nome, contato e logo).{" "}
          <Link href="/negocio" className="font-medium text-accent-strong underline">Preencha “Meu negócio”</Link> antes de enviar ao cliente.
        </Card>
      )}
      {data.products.length === 0 ? (
        <Card className="mb-4 text-sm text-muted">
          Você ainda não tem produtos no catálogo — dá para orçar só com personalizações, ou{" "}
          <Link href="/produtos/novo" className="font-medium text-accent-strong underline">cadastrar um produto</Link>.
        </Card>
      ) : null}
      <QuoteEditor products={data.products} customers={data.customers} defaults={data.defaults} preselect={produto} />
    </>
  );
}
