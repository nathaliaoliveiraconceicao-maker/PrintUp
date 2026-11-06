import Link from "next/link";
import { Card, PageHeader } from "@/components/ui/card";
import { StatTile } from "@/components/ui/stat-tile";
import { CATALOG_COLUMNS, type CatalogProduct } from "@/features/products/catalog-schema";
import { StockEditor } from "@/features/products/product-buttons";
import type { FilamentRow } from "@/features/filaments/schema";
import { ProductionForm } from "@/features/stock/production-form";
import { SPOOL_COLUMNS, type SpoolRow } from "@/features/stock/schema";
import { stockByFilament } from "@/features/stock/summary";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata = { title: "Estoque de produtos" };

const LOW_STOCK = 2;

export default async function ProductStockPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data }, filRes, spoolRes] = await Promise.all([
    supabase.from("products").select(CATALOG_COLUMNS).is("archived_at", null).order("name"),
    supabase.from("filaments").select("*").eq("is_active", true).order("name"),
    supabase.from("filament_spools").select(SPOOL_COLUMNS),
  ]);
  const products = (data ?? []) as CatalogProduct[];
  const stock = stockByFilament(((filRes.data ?? []) as FilamentRow[]).map((f) => ({ id: f.id, name: f.name, material: f.material, color: f.color, min_stock_g: f.min_stock_g ?? 250 })), (spoolRes.data ?? []) as SpoolRow[]);
  const view = sp.ver === "com" || sp.ver === "sem" ? sp.ver : "todos";
  const shown = products.filter((p) => (view === "com" ? p.stock_qty > 0 : view === "sem" ? p.stock_qty === 0 : true));
  const units = products.reduce((s, p) => s + p.stock_qty, 0);
  const withStock = products.filter((p) => p.stock_qty > 0).length;
  const low = products.filter((p) => p.stock_qty > 0 && p.stock_qty <= LOW_STOCK);

  return (
    <>
      <PageHeader title="Estoque de produtos" description="Quantas unidades prontas você tem de cada produto cadastrado. Ao registrar uma produção, o filamento usado é baixado das bobinas sozinho." />
      <div className="mb-4"><ProductionForm products={products.map((p) => ({ id: p.id, name: p.name, weight_g: p.weight_g, filament_id: p.filament_id }))} filaments={stock.map((s) => ({ id: s.filament.id, name: s.filament.name, available: Math.max(0, s.available) }))} /></div>
      <div className="mb-4 grid gap-3 sm:grid-cols-3" data-testid="resumo-estoque-produtos">
        <StatTile label="Produtos cadastrados" value={String(products.length)} />
        <StatTile label="Com estoque" value={String(withStock)} tone={withStock > 0 ? "ok" : "neutral"} />
        <StatTile label="Unidades prontas" value={units.toLocaleString("pt-BR")} tone={units > 0 ? "ok" : "neutral"} />
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
