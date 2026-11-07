import { CATEGORY_SLUGS, isCategory, isFilamentCategory } from "./categories";
import { pricePerKgCents } from "./pricing";

export type OfferView = {
  id: string; title: string; brand: string | null; category: string; imageUrl: string | null; storeCode: string; storeName: string; disclosure: string;
  priceCents: number; effectiveCents: number; previousCents: number | null; previousBasis: "loja" | "observado" | null; discountPct: number | null;
  coupon: { code: string; savedCents: number; validUntil: string | null } | null; shippingCents: number | null; inStock: boolean | null;
  validUntil: string | null; lastCheckedAt: string; isAffiliate: boolean; featured: boolean; score: number; weightG: number | null; perKgCents: number | null; canonicalKey: string | null; productId: string;
};

type OfferRow = { id: string; product_id: string; price_cents: number; previous_price_cents: number | null; previous_basis: "loja" | "observado" | null; discount_pct: number | null; coupon_id: string | null; coupon_saved_cents: number; shipping_cents: number | null; in_stock: boolean | null; score: number | null; link_url?: string; is_affiliate: boolean; featured: boolean; valid_until: string | null; last_checked_at: string };
type ProductRow = { id: string; store_id: string; title: string; brand: string | null; category: string; image_url: string | null; attrs: { weightG?: number } | null; canonical_key: string | null };
type StoreRow = { id: string; code: string; name: string; disclosure: string };
type CouponRow = { id: string; code: string; valid_until: string | null };

export function buildViews(offers: OfferRow[], products: ProductRow[], stores: StoreRow[], coupons: CouponRow[]): OfferView[] {
  const P = new Map(products.map((p) => [p.id, p])), S = new Map(stores.map((s) => [s.id, s])), C = new Map(coupons.map((c) => [c.id, c]));
  const out: OfferView[] = [];
  for (const o of offers) {
    const p = P.get(o.product_id);
    const s = p ? S.get(p.store_id) : undefined;
    if (!p || !s) continue; // sem produto/loja visíveis: não mostra
    const coupon = o.coupon_id && C.get(o.coupon_id) && o.coupon_saved_cents > 0 ? { code: C.get(o.coupon_id)!.code, savedCents: o.coupon_saved_cents, validUntil: C.get(o.coupon_id)!.valid_until } : null;
    const effective = o.price_cents - (coupon?.savedCents ?? 0);
    const weightG = isFilamentCategory(p.category) ? p.attrs?.weightG ?? null : null;
    out.push({
      id: o.id, productId: p.id, title: p.title, brand: p.brand, category: p.category, imageUrl: p.image_url, storeCode: s.code, storeName: s.name, disclosure: s.disclosure,
      priceCents: o.price_cents, effectiveCents: effective, previousCents: o.previous_price_cents, previousBasis: o.previous_basis, discountPct: o.discount_pct, coupon,
      shippingCents: o.shipping_cents, inStock: o.in_stock, validUntil: o.valid_until, lastCheckedAt: o.last_checked_at, isAffiliate: o.is_affiliate, featured: o.featured, score: o.score ?? 0,
      weightG, perKgCents: pricePerKgCents(effective, weightG), canonicalKey: p.canonical_key,
    });
  }
  return out;
}

export type Filters = { q: string; categoria: string; loja: string; min: number | null; max: number | null; ordem: "relevancia" | "menor_preco" | "maior_desconto" | "recentes" | "menor_preco_kg"; pagina: number };
export const ORDERS: Filters["ordem"][] = ["relevancia", "menor_preco", "maior_desconto", "recentes", "menor_preco_kg"];
export const PAGE_SIZE = 24;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const reais = (v: string) => { const n = Number(v.replace(",", ".")); return v && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null; };

export function parseFilters(sp: Record<string, string | string[] | undefined>): Filters {
  const cat = one(sp.categoria);
  const ordem = one(sp.ordem);
  const page = Number(one(sp.pagina));
  return {
    q: one(sp.q).trim().slice(0, 80),
    categoria: isCategory(cat) || cat === "filamentos" ? cat : "",
    loja: /^[a-z0-9_-]{2,30}$/.test(one(sp.loja)) ? one(sp.loja) : "",
    min: reais(one(sp.min)), max: reais(one(sp.max)),
    ordem: (ORDERS as string[]).includes(ordem) ? (ordem as Filters["ordem"]) : "relevancia",
    pagina: Number.isInteger(page) && page >= 1 && page <= 500 ? page : 1,
  };
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function applyFilters(items: OfferView[], f: Filters): OfferView[] {
  const words = norm(f.q).split(/\s+/).filter(Boolean);
  return items.filter((o) => {
    if (f.categoria === "filamentos" ? !o.category.startsWith("filamento-") : f.categoria && o.category !== f.categoria) return false;
    if (f.loja && o.storeCode !== f.loja) return false;
    if (f.min !== null && o.effectiveCents < f.min) return false;
    if (f.max !== null && o.effectiveCents > f.max) return false;
    if (words.length) { const t = norm(`${o.title} ${o.brand ?? ""} ${o.storeName}`); if (!words.every((w) => t.includes(w))) return false; }
    return true;
  });
}

export function sortViews(items: OfferView[], ordem: Filters["ordem"]): OfferView[] {
  const by = (fn: (o: OfferView) => number) => (a: OfferView, b: OfferView) => fn(a) - fn(b) || b.score - a.score;
  const list = [...items];
  switch (ordem) {
    case "menor_preco": return list.sort(by((o) => o.effectiveCents));
    case "menor_preco_kg": return list.sort(by((o) => o.perKgCents ?? Number.MAX_SAFE_INTEGER));
    case "maior_desconto": return list.sort(by((o) => -(o.discountPct ?? -1)));
    case "recentes": return list.sort(by((o) => -new Date(o.lastCheckedAt).getTime()));
    default: return list.sort((a, b) => Number(b.featured) - Number(a.featured) || b.score - a.score || a.effectiveCents - b.effectiveCents);
  }
}

export function paginate<T>(items: T[], page: number, size = PAGE_SIZE): { rows: T[]; pages: number; page: number } {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const p = Math.min(page, pages);
  return { rows: items.slice((p - 1) * size, p * size), pages, page: p };
}

export function facets(items: OfferView[]): { categories: { slug: string; n: number }[]; stores: { code: string; name: string; n: number }[] } {
  const c = new Map<string, number>(), s = new Map<string, { name: string; n: number }>();
  for (const o of items) {
    c.set(o.category, (c.get(o.category) ?? 0) + 1);
    s.set(o.storeCode, { name: o.storeName, n: (s.get(o.storeCode)?.n ?? 0) + 1 });
  }
  return { categories: CATEGORY_SLUGS.filter((x) => c.has(x)).map((x) => ({ slug: x, n: c.get(x)! })), stores: [...s].map(([code, v]) => ({ code, ...v })).sort((a, b) => a.name.localeCompare(b.name)) };
}

/** "há 3 h", "há 2 dias": a data da última verificação, para o usuário saber o quão fresco é o preço. */
export function agoLabel(iso: string, now: Date = new Date()): string {
  const h = Math.max(0, (now.getTime() - new Date(iso).getTime()) / 3_600_000);
  if (h < 1) return "há menos de 1 h";
  if (h < 24) return `há ${Math.floor(h)} h`;
  const d = Math.floor(h / 24);
  return `há ${d} ${d === 1 ? "dia" : "dias"}`;
}
