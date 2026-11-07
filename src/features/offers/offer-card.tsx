import Link from "next/link";
import { ExternalLink, Tag } from "lucide-react";
import { agoLabel, type OfferView } from "./listing";
import { categoryLabel } from "./categories";
import { cn, formatBRL, formatPercent } from "@/lib/utils";

const brl = (c: number) => formatBRL(c / 100);

export function PriceBlock({ o, big }: { o: OfferView; big?: boolean }) {
  return (
    <div className="space-y-0.5">
      <p className={cn("num font-semibold tracking-tight", big ? "text-4xl" : "text-2xl")} data-testid="preco-atual">{brl(o.priceCents)}</p>
      {o.previousCents !== null && o.previousBasis && (
        <p className="text-xs text-muted" data-testid="preco-anterior">
          <s className="num">{brl(o.previousCents)}</s> · {o.previousBasis === "loja" ? "preço anterior informado pela loja" : "referência: mediana observada pelo PrintUp"}
        </p>
      )}
      {o.coupon && <p className="text-xs font-medium text-ok" data-testid="cupom"><Tag size={12} className="mr-1 inline" aria-hidden="true" />Cupom <strong>{o.coupon.code}</strong>: {brl(o.effectiveCents)} com o cupom{o.coupon.validUntil ? ` (até ${new Date(o.coupon.validUntil).toLocaleDateString("pt-BR")})` : ""}</p>}
      {o.perKgCents !== null && <p className="num text-xs text-muted" data-testid="preco-kg">{brl(o.perKgCents)} por kg</p>}
    </div>
  );
}

export function OfferCard({ o, now }: { o: OfferView; now?: Date }) {
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/5" data-testid="oferta">
      <Link href={`/ofertas/${o.id}`} className="relative block aspect-[4/3] bg-paper">
        {o.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={o.imageUrl} alt={o.title} loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-contain p-3" />
        ) : (
          <span className="flex h-full items-center justify-center text-sm text-muted">Sem imagem</span>
        )}
        {o.discountPct !== null && <span className="num absolute left-2 top-2 rounded-lg bg-accent px-2 py-1 text-sm font-bold text-on-accent shadow" data-testid="desconto">−{formatPercent(o.discountPct)}</span>}
        {o.featured && <span className="absolute right-2 top-2 rounded-full bg-dark px-2 py-0.5 text-xs font-medium text-on-dark">Destaque</span>}
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="text-xs text-muted">{categoryLabel(o.category)} · {o.storeName}{o.brand ? ` · ${o.brand}` : ""}</p>
        <h3 className="line-clamp-2 font-semibold leading-snug"><Link href={`/ofertas/${o.id}`} className="hover:underline">{o.title}</Link></h3>
        <PriceBlock o={o} />
        <div className="mt-auto space-y-2 pt-2">
          <p className="text-xs text-muted">Verificado {agoLabel(o.lastCheckedAt, now)}{o.validUntil ? ` · válido até ${new Date(o.validUntil).toLocaleDateString("pt-BR")}` : ""}{o.inStock === false ? " · sem estoque" : ""}</p>
          <div className="flex items-center gap-2">
            <a href={`/ir/${o.id}`} target="_blank" rel="sponsored nofollow noopener noreferrer" className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent hover:brightness-95" data-testid="ver-oferta">
              Ver oferta <ExternalLink size={14} aria-hidden="true" />
            </a>
          </div>
          {o.isAffiliate && <p className="text-[11px] text-muted" data-testid="selo-afiliado">Link de afiliado: o PrintUp pode receber comissão, sem custo extra para você.</p>}
        </div>
      </div>
    </article>
  );
}
