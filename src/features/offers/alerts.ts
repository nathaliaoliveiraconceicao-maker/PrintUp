import { pricePerKgCents } from "./pricing";
import { extractSpecs } from "./specs";

export type AlertRule = {
  kind: "preco_abaixo" | "desconto_acima" | "voltou_estoque";
  category?: string;
  query?: string; // palavras que precisam estar no título (todas)
  storeCode?: string;
  maxPriceCents?: number;
  maxPricePerKgCents?: number;
  minDiscountPct?: number;
};

export type AlertOffer = {
  id: string; title: string; category: string; storeCode: string; priceCents: number; discountPct: number | null; inStock: boolean | null; wasOutOfStock?: boolean;
  weightG?: number | null;
  storeName?: string;
};

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function alertMatches(rule: AlertRule, o: AlertOffer): boolean {
  if (o.inStock === false) return false;
  if (rule.category && rule.category !== o.category) return false;
  if (rule.storeCode && rule.storeCode !== o.storeCode) return false;
  if (rule.query) {
    const t = norm(o.title);
    if (!norm(rule.query).split(/\s+/).filter(Boolean).every((w) => t.includes(w))) return false;
  }
  if (rule.kind === "voltou_estoque") return o.wasOutOfStock === true && o.inStock === true;
  if (rule.kind === "desconto_acima") return rule.minDiscountPct !== undefined && o.discountPct !== null && o.discountPct >= rule.minDiscountPct;
  // preco_abaixo
  if (rule.maxPriceCents !== undefined && o.priceCents > rule.maxPriceCents) return false;
  if (rule.maxPricePerKgCents !== undefined) {
    const w = o.weightG ?? extractSpecs(o.title).weightG;
    const perKg = pricePerKgCents(o.priceCents, w);
    if (perKg === null || perKg > rule.maxPricePerKgCents) return false; // sem peso conhecido, não dispara
  }
  return rule.maxPriceCents !== undefined || rule.maxPricePerKgCents !== undefined;
}

/** Anti-repetição: não avisa de novo a mesma oferta, a menos que o preço tenha caído pelo menos `minDropPct` desde o último aviso. */
export function shouldNotify(a: { lastNotifiedPriceCents: number | null; lastNotifiedAt: Date | null; priceCents: number; now?: Date; cooldownHours?: number; minDropPct?: number }): boolean {
  if (a.lastNotifiedPriceCents === null || a.lastNotifiedAt === null) return true;
  const now = a.now ?? new Date();
  const hours = (now.getTime() - a.lastNotifiedAt.getTime()) / 3_600_000;
  if (hours < (a.cooldownHours ?? 24)) return false;
  return a.priceCents <= a.lastNotifiedPriceCents * (1 - (a.minDropPct ?? 5) / 100);
}
