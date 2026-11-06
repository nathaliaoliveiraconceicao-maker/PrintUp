import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { TOKEN_RE } from "@/features/catalog-share/schema";
import { createClient } from "@/lib/supabase/server";
import { formatBRL } from "@/lib/utils";

type Info = { business_name: string | null; brand_color: string; phone: string | null; city: string | null; title: string | null; show_prices: boolean };
type Item = { product_id: string; name: string; category: string | null; description: string | null; sale_price: number | null; stock_qty: number; has_photo: boolean };

export default async function PublicCatalogPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!TOKEN_RE.test(token)) notFound();
  const supabase = await createClient();
  const [infoRes, itemsRes] = await Promise.all([supabase.rpc("public_catalog_info", { p_token: token }), supabase.rpc("public_catalog_items", { p_token: token })]);
  const info = ((infoRes.data ?? []) as Info[])[0];
  if (!info) notFound();
  const items = (itemsRes.data ?? []) as Item[];
  const name = info.title || info.business_name || "Catálogo";
  const wa = info.phone?.replace(/\D/g, "");
  const byCategory = new Map<string, Item[]>();
  for (const it of items) byCategory.set(it.category ?? "Outros", [...(byCategory.get(it.category ?? "Outros") ?? []), it]);

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6" data-testid="vitrine-publica">
      <header className="relative mb-8 overflow-hidden rounded-3xl bg-dark px-6 py-8 text-on-dark sm:px-10 sm:py-12">
        <div className="absolute -right-12 -top-16 h-56 w-56 rounded-full blur-3xl" style={{ backgroundColor: info.brand_color, opacity: 0.35 }} aria-hidden="true" />
        <div className="relative">
          <h1 className="text-balance text-3xl font-bold tracking-tight text-white sm:text-5xl">{name}</h1>
          <p className="mt-2 text-on-dark/75">{[info.business_name && info.title ? info.business_name : null, info.city].filter(Boolean).join(" · ") || "Produtos feitos em impressão 3D"}</p>
          {wa && wa.length >= 10 && (
            <a href={`https://wa.me/${wa.length <= 11 ? `55${wa}` : wa}`} target="_blank" rel="noopener noreferrer" className="mt-6 hidden min-h-12 items-center rounded-xl px-6 font-semibold text-on-accent shadow-lg transition hover:-translate-y-0.5 sm:inline-flex" style={{ backgroundColor: info.brand_color }}>Pedir pelo WhatsApp</a>
          )}
        </div>
      </header>

      {items.length === 0 ? (
        <Card className="text-center text-muted">Nenhum produto disponível no momento.</Card>
      ) : (
        [...byCategory.entries()].map(([cat, list]) => (
          <section key={cat} className="mb-10" aria-label={cat}>
            {byCategory.size > 1 && <h2 className="mb-4 flex items-center gap-3 text-xl font-bold"><span className="h-6 w-1.5 rounded-full" style={{ backgroundColor: info.brand_color }} aria-hidden="true" />{cat}</h2>}
            <ul className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
              {list.map((p) => (
                <li key={p.product_id}>
                  <article className="group h-full overflow-hidden rounded-2xl border border-line bg-surface transition hover:-translate-y-1 hover:shadow-xl hover:shadow-black/10" data-testid="item-vitrine">
                    <div className="relative aspect-square overflow-hidden bg-paper">
                      {p.has_photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`/c/${token}/foto/${p.product_id}`} alt={p.name} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-sm text-muted">Sem foto</div>
                      )}
                      {info.show_prices && p.sale_price != null && (
                        <span className="num absolute bottom-2 left-2 rounded-lg bg-dark/90 px-2.5 py-1 text-base font-semibold text-white shadow-md sm:text-lg">{formatBRL(p.sale_price)}</span>
                      )}
                    </div>
                    <div className="space-y-1.5 p-3 sm:p-4">
                      <h3 className="font-semibold leading-snug">{p.name}</h3>
                      {p.description && <p className="line-clamp-2 text-sm text-muted">{p.description}</p>}
                      <span className={p.stock_qty > 0 ? "inline-flex items-center gap-1.5 text-xs font-medium text-ok" : "inline-flex items-center gap-1.5 text-xs font-medium text-muted"}>
                        <span className={p.stock_qty > 0 ? "h-2 w-2 rounded-full bg-ok" : "h-2 w-2 rounded-full bg-muted"} aria-hidden="true" />
                        {p.stock_qty > 0 ? `${p.stock_qty} em estoque` : "Sob encomenda"}
                      </span>
                    </div>
                  </article>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      <footer className="mt-10 text-center text-xs text-muted">Preços e disponibilidade sujeitos a alteração.</footer>
      {wa && wa.length >= 10 && (
        <a href={`https://wa.me/${wa.length <= 11 ? `55${wa}` : wa}`} target="_blank" rel="noopener noreferrer" className="fixed inset-x-4 bottom-4 z-10 flex min-h-12 items-center justify-center rounded-2xl font-semibold text-on-accent shadow-xl sm:hidden" style={{ backgroundColor: info.brand_color }}>Pedir pelo WhatsApp</a>
      )}
    </main>
  );
}
