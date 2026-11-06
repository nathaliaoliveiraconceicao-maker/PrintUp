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
    <main className="mx-auto max-w-5xl px-5 py-8" data-testid="vitrine-publica">
      <header className="mb-8 border-b-4 pb-5" style={{ borderColor: info.brand_color }}>
        <h1 className="text-3xl font-bold tracking-tight">{name}</h1>
        <p className="mt-1 text-sm text-muted">{[info.business_name && info.title ? info.business_name : null, info.city].filter(Boolean).join(" · ") || "Produtos disponíveis"}</p>
        {wa && wa.length >= 10 && (
          <a href={`https://wa.me/${wa.length <= 11 ? `55${wa}` : wa}`} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex min-h-11 items-center rounded-xl px-4 font-semibold text-ink hover:brightness-95" style={{ backgroundColor: info.brand_color }}>Pedir pelo WhatsApp</a>
        )}
      </header>

      {items.length === 0 ? (
        <Card className="text-center text-muted">Nenhum produto disponível no momento.</Card>
      ) : (
        [...byCategory.entries()].map(([cat, list]) => (
          <section key={cat} className="mb-8" aria-label={cat}>
            {byCategory.size > 1 && <h2 className="mb-3 text-lg font-semibold">{cat}</h2>}
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((p) => (
                <li key={p.product_id}>
                  <Card className="h-full overflow-hidden p-0" data-testid="item-vitrine">
                    {p.has_photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/c/${token}/foto/${p.product_id}`} alt={p.name} loading="lazy" className="aspect-square w-full bg-surface object-cover" />
                    ) : (
                      <div className="flex aspect-square w-full items-center justify-center bg-surface text-sm text-muted">Sem foto</div>
                    )}
                    <div className="space-y-1 p-4">
                      <p className="font-semibold">{p.name}</p>
                      {p.description && <p className="line-clamp-3 text-sm text-muted">{p.description}</p>}
                      <div className="flex items-baseline justify-between gap-3 pt-1">
                        {info.show_prices && p.sale_price != null ? <span className="num text-xl font-semibold">{formatBRL(p.sale_price)}</span> : <span />}
                        <span className={p.stock_qty > 0 ? "rounded-full bg-ok/10 px-2 py-0.5 text-xs text-ok" : "rounded-full bg-paper px-2 py-0.5 text-xs text-muted"}>{p.stock_qty > 0 ? `${p.stock_qty} em estoque` : "Sob encomenda"}</span>
                      </div>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      <footer className="mt-10 text-center text-xs text-muted">Preços e disponibilidade sujeitos a alteração.</footer>
    </main>
  );
}
