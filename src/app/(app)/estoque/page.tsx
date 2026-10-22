import Link from "next/link";
import { Card, PageHeader } from "@/components/ui/card";
import { CATALOG_COLUMNS, type CatalogProduct } from "@/features/products/catalog-schema";
import { StockEditor } from "@/features/products/product-buttons";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata = { title: "Estoque de produtos" };

const LOW_STOCK = 2;

export default async function ProductStockPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("products").select(CATALOG_COLUMNS).is("archived_at", null).order("name");
  const products = (data ?? []) as CatalogProduct[];
  const view = sp.ver === "com" || sp.ver === "sem" ? sp.ver : "todos";
  const shown = products.filter((p) => (view === "com" ? p.stock_qty > 0 : view === "sem" ? p.stock_qty === 0 : true));
  const units = products.reduce((s, p) => s + p.stock_qty, 0);
  const withStock = products.filter((p) => p.stock_qty > 0).length;
  const low = products.filter((p) => p.stock_qty > 0 && p.stock_qty <= LOW_STOCK);

  return (
    <>
      <PageHeader title="Estoque de produtos" description="Quantas unidades prontas você tem de cada produto cadastrado. O estoque de filamento fica em Filamentos." />
      <div className="mb-4 grid gap-3 sm:grid-cols-3" data-testid="resumo-estoque-produtos">
        <Card><p className="text-sm text-muted">Produtos cadastrados</p><p className="num text-2xl font-semibold">{products.length}</p></Card>
        <Card><p className="text-sm text-muted">Com estoque</p><p className="num text-2xl font-semibold">{withStock}</p></Card>
        <Card><p className="text-sm text-muted">Unidades prontas</p><p className="num text-2xl font-semibold">{units.toLocaleString("pt-BR")}</p></Card>
      </div>
      {low.length > 0 && <p role="alert" className="mb-4 rounded-xl bg-accent-soft px-3 py-2 text-sm text-warn">Estoque baixo: {low.map((p) => `${p.name} (${p.stock_qty})`).join(", ")}.</p>}
      <nav aria-label="Filtro" className="mb-4 flex gap-2 overflow-x-auto">
        {([["todos", "Todos"], ["com", "Com estoque"], ["sem", "Sem estoque"]] as const).map(([k, l]) => (
          <Link key={k} href={k === "todos" ? "/estoque" : `/estoque?ver=${k}`} aria-current={view === k ? "page" : undefined}
            className={cn("flex h-10 shrink-0 items-center rounded-full border px-4 text-sm", view === k ? "border-ink bg-ink font-medium text-paper" : "border-line bg-surface text-muted hover:text-ink")}>{l}</Link>
        ))}
      </nav>
      {products.length === 0 ? (
        <Card className="text-center text-muted">Nenhum produto ainda. Cadastre um em <Link href="/produtos" className="font-medium text-accent-strong underline">Meus produtos</Link> para controlar o estoque dele.</Card>
      ) : shown.length === 0 ? (
        <Card className="text-center text-sm text-muted">Nenhum produto neste filtro.</Card>
      ) : (
        <ul className="space-y-3" data-testid="lista-estoque-produtos">
          {shown.map((p) => (
            <li key={p.id}>
              <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
                <Link href={`/produtos/${p.id}`} className="min-w-0 flex-1">
                  <p className="truncate font-medium">{p.name}</p>
                  <p className="text-xs text-muted">{p.category ?? "Sem categoria"}{p.stock_qty === 0 ? " · sem estoque" : p.stock_qty <= LOW_STOCK ? " · estoque baixo" : ""}</p>
                </Link>
                <StockEditor id={p.id} qty={p.stock_qty} />
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
