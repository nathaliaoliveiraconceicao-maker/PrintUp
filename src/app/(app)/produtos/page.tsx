import Link from "next/link";
import { AlertTriangle, Calculator, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { CATALOG_COLUMNS, type CatalogProduct } from "@/features/products/catalog-schema";
import { imageUrls } from "@/features/products/image-urls";
import { ProductButtons } from "@/features/products/product-buttons";
import { loadStaleness } from "@/features/products/queries";
import { DEFAULT_SETTINGS } from "@/features/settings/schema";
import { createClient } from "@/lib/supabase/server";
import { cn, formatBRL, formatPercent } from "@/lib/utils";

export const metadata = { title: "Meus produtos" };

const VIEWS = [
  ["ativos", "Ativos"],
  ["estoque", "Com estoque"],
  ["desatualizados", "Custos mudaram"],
  ["arquivados", "Arquivados"],
] as const;

const LOW_STOCK = 2;

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string; cat?: string; ver?: string }> }) {
  const sp = await searchParams;
  const view = VIEWS.some(([k]) => k === sp.ver) ? (sp.ver as (typeof VIEWS)[number][0]) : "ativos";
  const q = (sp.q ?? "").trim().toLowerCase();
  const cat = (sp.cat ?? "").trim();

  const supabase = await createClient();
  const [{ data }, settingsRes] = await Promise.all([
    supabase.from("products").select(CATALOG_COLUMNS).order("name"),
    supabase.from("cost_settings").select("margin_percent").maybeSingle(),
  ]);
  const target = (settingsRes.data as { margin_percent: number } | null)?.margin_percent ?? DEFAULT_SETTINGS.margin_percent;
  const all = (data ?? []) as CatalogProduct[];
  const stale = await loadStaleness(supabase, all.filter((p) => !p.archived_at));
  const categories = [...new Set(all.map((p) => p.category).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const staleCount = [...stale.values()].filter((s) => s.stale).length;

  const rows = all.filter((p) => {
    if (view === "arquivados" ? !p.archived_at : p.archived_at) return false;
    if (view === "estoque" && p.stock_qty <= 0) return false;
    if (view === "desatualizados" && !stale.get(p.id)?.stale) return false;
    if (cat && p.category !== cat) return false;
    if (q && !`${p.name} ${p.category ?? ""} ${p.filament_type ?? ""} ${p.filament_color ?? ""}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const photos = await imageUrls(supabase, rows.map((p) => p.photo_path));
  const href = (over: Record<string, string>) => {
    const p = new URLSearchParams({ ...(q ? { q } : {}), ...(cat ? { cat } : {}), ver: view, ...over });
    return `/produtos?${p.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Meus produtos"
        description="Seu catálogo: custo, preço, estoque e tudo que você precisa para orçar."
        action={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="secondary"><Link href="/calculadora"><Calculator size={18} />Precificar</Link></Button>
            <Button asChild><Link href="/produtos/novo"><Plus size={18} />Novo produto</Link></Button>
          </div>
        }
      />

      {staleCount > 0 && (
        <Card className="mb-4 flex flex-col gap-3 border-warn/40 bg-accent-soft/50 sm:flex-row sm:items-center" data-testid="aviso-desatualizados">
          <AlertTriangle size={18} className="text-warn" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-sm">
            <strong>{staleCount} produto{staleCount > 1 ? "s" : ""}</strong> com custos diferentes do que você cadastrou hoje (filamento, impressora…).
            Os preços salvos <strong>não mudam sozinhos</strong>.
          </p>
          <Button asChild size="sm"><Link href="/produtos/recalcular"><RefreshCw size={14} />Revisar e recalcular</Link></Button>
        </Card>
      )}

      <form className="mb-4 grid gap-3 sm:grid-cols-[1fr_200px_auto]" role="search" aria-label="Buscar produtos">
        <input type="hidden" name="ver" value={view} />
        <Input name="q" defaultValue={sp.q ?? ""} placeholder="Buscar por nome, categoria, material…" aria-label="Buscar" type="search" />
        <Select name="cat" defaultValue={cat} aria-label="Categoria">
          <option value="">Todas as categorias</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
        <Button type="submit" variant="secondary">Filtrar</Button>
      </form>

      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Filtro do catálogo">
        {VIEWS.map(([k, label]) => (
          <Link
            key={k}
            href={href({ ver: k })}
            aria-current={view === k ? "page" : undefined}
            className={cn("flex h-9 items-center rounded-full border px-4 text-sm", view === k ? "border-accent bg-accent-soft font-medium text-accent-strong" : "border-line text-muted hover:text-ink")}
          >
            {label}{k === "desatualizados" && staleCount > 0 ? ` (${staleCount})` : ""}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <Card className="text-center text-muted">
          {all.length === 0 ? (
            <>Nenhum produto ainda. Faça um cálculo na <Link href="/calculadora" className="font-medium text-accent-strong underline">calculadora</Link> e use “Salvar como produto”, ou <Link href="/produtos/novo" className="font-medium text-accent-strong underline">cadastre um produto</Link>.</>
          ) : (
            "Nenhum produto neste filtro."
          )}
        </Card>
      ) : (
        <ul className="space-y-3" data-testid="lista-produtos">
          {rows.map((p) => {
            const s = stale.get(p.id);
            const photo = photos.get(p.photo_path ?? "");
            return (
              <li key={p.id}>
                <Card className="space-y-3 p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-paper text-xs text-muted">
                      {photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={photo} alt="" className="h-full w-full object-contain" />
                      ) : (
                        "sem foto"
                      )}
                    </div>
                    <Link href={`/produtos/${p.id}`} className="min-w-0 flex-1">
                      <p className="truncate font-medium">{p.name}</p>
                      <p className="truncate text-xs text-muted">
                        {[p.category, p.filament_type, p.filament_color].filter(Boolean).join(" · ") || "Sem categoria"}
                      </p>
                      <p className="num mt-1 text-sm">
                        {p.sale_price !== null ? <strong>{formatBRL(p.sale_price)}</strong> : <span className="text-muted">sem preço</span>}
                        {p.production_cost !== null && <span className="text-muted"> · custo {formatBRL(p.production_cost)}</span>}
                        {p.margin_percent !== null && (
                          <span className="text-muted"> · margem {p.margin_basis === "bruta" ? "bruta " : ""}{formatPercent(p.margin_percent)}</span>
                        )}
                      </p>
                    </Link>
                    <div className="text-right text-sm">
                      <p className={cn("num font-medium", p.stock_qty <= LOW_STOCK && p.stock_qty > 0 && "text-warn")}>{p.stock_qty}</p>
                      <p className="text-xs text-muted">em estoque</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {s?.stale && (
                      <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs text-warn" data-testid="selo-desatualizado">
                        Custos mudaram: hoje seria {formatBRL(s.newPrice)}
                      </span>
                    )}
                    {p.margin_basis === "liquida" && p.margin_percent !== null && p.margin_percent < target - 1 && (
                      <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs text-warn">Abaixo da sua margem padrão ({formatPercent(target)})</span>
                    )}
                    {p.stock_qty === 0 && !p.archived_at && <span className="rounded-full bg-paper px-2 py-0.5 text-xs text-muted">Sem estoque</span>}
                    {p.archived_at && <span className="rounded-full bg-paper px-2 py-0.5 text-xs text-muted">Arquivado</span>}
                  </div>
                  <ProductButtons id={p.id} archived={Boolean(p.archived_at)} stale={s?.stale} compact />
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
