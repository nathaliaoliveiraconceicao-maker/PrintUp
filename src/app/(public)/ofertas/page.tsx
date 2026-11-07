import Link from "next/link";
import { Bell, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { categoryLabel, OFFER_CATEGORIES } from "@/features/offers/categories";
import { loadPublicOffers } from "@/features/offers/data";
import { applyFilters, facets, paginate, parseFilters, sortViews, type Filters } from "@/features/offers/listing";
import { OfferCard } from "@/features/offers/offer-card";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata = { title: "Ofertas 3D", description: "Filamentos, impressoras 3D, peças e acessórios com preço verificado, histórico e comparação entre lojas." };

const ORDER_LABEL: Record<Filters["ordem"], string> = { relevancia: "Relevância", menor_preco: "Menor preço", menor_preco_kg: "Menor preço por kg", maior_desconto: "Maior desconto", recentes: "Verificadas há pouco" };

export default async function OffersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const f = parseFilters(sp);
  const supabase = await createClient();
  const all = await loadPublicOffers(supabase);
  const shown = sortViews(applyFilters(all, f), f.ordem);
  const page = paginate(shown, f.pagina);
  const fc = facets(all);
  const qs = (over: Partial<Record<string, string>>) => {
    const p = new URLSearchParams();
    const cur: Record<string, string> = { q: f.q, categoria: f.categoria, loja: f.loja, min: String(sp.min ?? ""), max: String(sp.max ?? ""), ordem: f.ordem === "relevancia" ? "" : f.ordem, ...over };
    for (const [k, v] of Object.entries(cur)) if (v) p.set(k, v);
    const s = p.toString();
    return `/ofertas${s ? `?${s}` : ""}`;
  };
  const featured = all.filter((o) => o.featured).slice(0, 3);

  return (
    <div className="space-y-6" data-testid="central-ofertas">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Ofertas 3D</h1>
        <p className="max-w-2xl text-muted">Filamentos, impressoras e acessórios com preço verificado. Só mostramos desconto quando ele é comprovado, e a data da última verificação está em cada oferta.</p>
        <p className="rounded-xl bg-paper px-3 py-2 text-xs text-muted" data-testid="aviso-afiliados">
          Transparência: alguns links desta página são de <strong className="text-ink">afiliados</strong>. Se você comprar por eles, o PrintUp pode receber uma comissão, sem custo extra para você. Isso não altera o preço que você paga nem a ordem das ofertas.
        </p>
      </header>

      <form method="get" action="/ofertas" role="search" aria-label="Buscar ofertas" className="grid gap-3 rounded-2xl border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1.2fr_1fr_.7fr_.7fr_1.2fr_auto]" data-testid="filtros-ofertas">
        <label className="relative block"><span className="sr-only">Buscar</span><Search size={16} className="pointer-events-none absolute left-3 top-3.5 text-muted" aria-hidden="true" />
          <input name="q" defaultValue={f.q} placeholder="Buscar produto ou marca" className="h-11 w-full rounded-xl border border-line bg-surface pl-9 pr-3 text-base text-ink sm:text-sm" /></label>
        <select name="categoria" defaultValue={f.categoria} aria-label="Categoria" className="h-11 rounded-xl border border-line bg-surface px-3 text-base text-ink sm:text-sm">
          <option value="">Todas as categorias</option><option value="filamentos">Todos os filamentos</option>
          {OFFER_CATEGORIES.map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}
        </select>
        <select name="loja" defaultValue={f.loja} aria-label="Loja" className="h-11 rounded-xl border border-line bg-surface px-3 text-base text-ink sm:text-sm">
          <option value="">Todas as lojas</option>{fc.stores.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
        </select>
        <input name="min" inputMode="decimal" defaultValue={String(sp.min ?? "")} placeholder="Preço mín." aria-label="Preço mínimo" className="h-11 rounded-xl border border-line bg-surface px-3 text-base text-ink sm:text-sm" />
        <input name="max" inputMode="decimal" defaultValue={String(sp.max ?? "")} placeholder="Preço máx." aria-label="Preço máximo" className="h-11 rounded-xl border border-line bg-surface px-3 text-base text-ink sm:text-sm" />
        <select name="ordem" defaultValue={f.ordem} aria-label="Ordenar por" className="h-11 rounded-xl border border-line bg-surface px-3 text-base text-ink sm:text-sm">
          {(Object.keys(ORDER_LABEL) as Filters["ordem"][]).map((k) => <option key={k} value={k}>{ORDER_LABEL[k]}</option>)}
        </select>
        <button type="submit" className="h-11 rounded-xl bg-dark px-5 text-sm font-semibold text-on-dark">Filtrar</button>
      </form>

      <nav aria-label="Categorias" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {[{ slug: "", label: "Tudo" }, ...fc.categories.map((c) => ({ slug: c.slug, label: `${categoryLabel(c.slug)} (${c.n})` }))].map((c) => (
          <Link key={c.slug} href={qs({ categoria: c.slug, pagina: "" })} aria-current={f.categoria === c.slug ? "page" : undefined}
            className={cn("flex h-10 shrink-0 items-center rounded-full border px-4 text-sm", f.categoria === c.slug ? "border-dark bg-dark font-medium text-on-dark" : "border-line bg-surface text-muted hover:text-ink")}>{c.label}</Link>
        ))}
      </nav>

      {featured.length > 0 && !f.q && !f.categoria && !f.loja && f.min === null && f.max === null && f.pagina === 1 && (
        <section aria-labelledby="h-destaques" className="space-y-3">
          <h2 id="h-destaques" className="text-lg font-bold">Destaques</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{featured.map((o) => <OfferCard key={o.id} o={o} />)}</div>
        </section>
      )}

      <section aria-label="Resultados" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted" data-testid="contagem">{shown.length} {shown.length === 1 ? "oferta" : "ofertas"}</p>
          <Link href="/alertas" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-accent-strong hover:underline"><Bell size={16} aria-hidden="true" />Criar alerta de preço</Link>
        </div>
        {page.rows.length === 0 ? (
          <Card className="space-y-2 text-center" data-testid="sem-ofertas">
            <p className="font-medium">{all.length === 0 ? "Ainda não há ofertas publicadas." : "Nenhuma oferta com esses filtros."}</p>
            <p className="text-sm text-muted">{all.length === 0 ? "As ofertas aparecem aqui depois de verificadas. Volte em breve ou crie um alerta de preço." : <Link href="/ofertas" className="font-medium text-accent-strong underline">Limpar filtros</Link>}</p>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{page.rows.map((o) => <OfferCard key={o.id} o={o} />)}</div>
        )}
        {page.pages > 1 && (
          <nav aria-label="Páginas" className="flex flex-wrap justify-center gap-2 pt-2">
            {Array.from({ length: page.pages }, (_, i) => i + 1).map((n) => (
              <Link key={n} href={qs({ pagina: n === 1 ? "" : String(n) })} aria-current={n === page.page ? "page" : undefined} className={cn("flex h-10 min-w-10 items-center justify-center rounded-xl border px-3 text-sm", n === page.page ? "border-dark bg-dark text-on-dark" : "border-line bg-surface text-muted")}>{n}</Link>
            ))}
          </nav>
        )}
      </section>
    </div>
  );
}
