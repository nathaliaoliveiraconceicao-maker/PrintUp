import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { categoryLabel, isFilamentCategory } from "@/features/offers/categories";
import { loadPriceHistory, loadPublicOffers } from "@/features/offers/data";
import { compareEquivalents, type Comparable } from "@/features/offers/equivalence";
import { lowestPriceLabel, priceStats } from "@/features/offers/history";
import { agoLabel } from "@/features/offers/listing";
import { PriceBlock } from "@/features/offers/offer-card";
import { PriceChart } from "@/features/offers/price-chart";
import { UUID_RE } from "@/features/offers/redirect";
import { UseInCalculator } from "@/features/offers/use-in-calculator";
import { createClient } from "@/lib/supabase/server";
import { formatBRL, formatPercent } from "@/lib/utils";

export const metadata = { title: "Oferta" };
const brl = (c: number) => formatBRL(c / 100);

export default async function OfferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const supabase = await createClient();
  const all = await loadPublicOffers(supabase);
  const o = all.find((x) => x.id === id);
  if (!o) notFound();
  const [history, auth] = await Promise.all([loadPriceHistory(supabase, o.productId), supabase.auth.getUser()]);
  const stats = priceStats(history, { windowDays: 90 });
  const toComparable = (v: typeof o): Comparable & { v: typeof o } => ({ v, category: v.category, brand: v.brand, title: v.title, priceCents: v.priceCents, shippingCents: v.shippingCents, couponSavedCents: v.coupon?.savedCents ?? 0, specs: v.weightG ? { weightG: v.weightG } : undefined });
  // só entram como equivalentes os que têm a MESMA chave canônica (marca, modelo/material, peso, variante)
  const sameKey = o.canonicalKey ? all.filter((x) => x.canonicalKey === o.canonicalKey) : [];
  const cmp = sameKey.length > 1 ? compareEquivalents(toComparable(o), sameKey.filter((x) => x.id !== o.id).map(toComparable)) : null;
  const user = auth.data.user;
  const filaments = user && isFilamentCategory(o.category) ? ((await supabase.from("filaments").select("id, name, price_per_kg").eq("is_active", true).order("name")).data ?? []) : [];

  return (
    <div className="space-y-6" data-testid="detalhe-oferta">
      <Link href="/ofertas" className="inline-flex min-h-11 items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft size={16} />Ofertas 3D</Link>
      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="flex aspect-square items-center justify-center overflow-hidden rounded-3xl border border-line bg-surface">
          {o.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={o.imageUrl} alt={o.title} referrerPolicy="no-referrer" className="h-full w-full object-contain p-6" />
          ) : <span className="text-muted">Sem imagem</span>}
        </div>
        <div className="space-y-4">
          <p className="text-sm text-muted">{categoryLabel(o.category)} · {o.storeName}{o.brand ? ` · ${o.brand}` : ""}</p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{o.title}</h1>
          <PriceBlock o={o} big />
          {o.discountPct !== null && <p className="text-sm"><span className="num rounded-lg bg-accent px-2 py-1 font-bold text-on-accent">−{formatPercent(o.discountPct)}</span> <span className="text-muted">calculado sobre o preço anterior {o.previousBasis === "loja" ? "informado pela loja" : "de referência observado pelo PrintUp"}.</span></p>}
          <p className="text-xs text-muted">Última verificação: {agoLabel(o.lastCheckedAt)} ({new Date(o.lastCheckedAt).toLocaleString("pt-BR")}){o.validUntil ? ` · válido até ${new Date(o.validUntil).toLocaleDateString("pt-BR")}` : ""}. Preço e disponibilidade podem mudar na loja.</p>
          <a href={`/ir/${o.id}`} target="_blank" rel="sponsored nofollow noopener noreferrer" className="inline-flex h-12 items-center gap-2 rounded-xl bg-accent px-6 font-semibold text-on-accent hover:brightness-95" data-testid="ver-oferta">Ver oferta na {o.storeName}<ExternalLink size={16} aria-hidden="true" /></a>
          {o.isAffiliate && <p className="text-xs text-muted" data-testid="selo-afiliado">{o.disclosure}</p>}
          {isFilamentCategory(o.category) && (o.perKgCents !== null
            ? <UseInCalculator offerId={o.id} title={o.title} perKgCents={o.perKgCents} loggedIn={Boolean(user)} filaments={filaments as { id: string; name: string; price_per_kg: number }[]} />
            : <p className="text-xs text-muted">Não foi possível identificar o peso do filamento no anúncio, então não calculamos o preço por kg.</p>)}
        </div>
      </div>

      <Card className="space-y-3">
        <h2 className="text-lg font-semibold">Histórico de preços</h2>
        <PriceChart history={history} />
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4" data-testid="estatisticas">
          <div><dt className="text-xs text-muted">Preço atual</dt><dd className="num font-semibold">{brl(o.priceCents)}</dd></div>
          <div><dt className="text-xs text-muted">Menor observado</dt><dd className="num font-semibold">{stats.min !== null ? brl(stats.min) : "—"}</dd></div>
          <div><dt className="text-xs text-muted">Média observada</dt><dd className="num font-semibold">{stats.avg !== null ? brl(stats.avg) : "—"}</dd></div>
          <div><dt className="text-xs text-muted">Variação em 7 dias</dt><dd className="num font-semibold">{stats.variation7dPct !== null ? formatPercent(stats.variation7dPct) : "—"}</dd></div>
        </dl>
        <p className="text-xs text-muted" data-testid="rotulo-historico">{lowestPriceLabel(stats, brl)} Observações feitas pelo PrintUp (lojas e fontes cadastradas), não todo o mercado.</p>
      </Card>

      <Card className="space-y-3" data-testid="comparador">
        <h2 className="text-lg font-semibold">Comparar entre lojas</h2>
        {cmp && cmp.rows.length > 1 ? (
          <>
            <ul className="divide-y divide-line">
              {cmp.rows.map((r) => (
                <li key={r.item.v.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <span><strong>{r.item.v.storeName}</strong>{r.item.v.id === o.id ? " (esta oferta)" : ""}</span>
                  <span className="num">{brl(r.effectiveCents)}{r.perKgCents !== null ? ` · ${brl(r.perKgCents)}/kg` : ""}</span>
                  {r.item.v.id !== o.id && <Link href={`/ofertas/${r.item.v.id}`} className="font-medium text-accent-strong hover:underline">Ver</Link>}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted">Só comparamos o mesmo produto (mesma marca, material, peso e versão). {cmp.shippingComparable ? "Frete incluído." : "Frete não incluído (não é conhecido em todas as lojas)."} Preços com cupom quando válido.</p>
          </>
        ) : (
          <p className="text-sm text-muted">Ainda não há o mesmo produto em outra loja para comparar. Não comparamos produtos de peso ou especificação diferentes (por exemplo, 1 kg com 500 g).</p>
        )}
      </Card>
    </div>
  );
}
