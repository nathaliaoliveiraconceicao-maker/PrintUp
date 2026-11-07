/** Regras determinísticas de preço, desconto e cupom. Tudo em CENTAVOS (inteiros). Nada aqui usa IA. */
export type Observation = { priceCents: number; at: Date };

export const toCents = (reais: number): number => Math.round(reais * 100);

export function isPlausiblePrice(cents: number): boolean {
  return Number.isInteger(cents) && cents >= 100 && cents <= 100_000_00; // R$ 1 a R$ 100.000
}

/** Desconto em % (1 casa), só quando o preço anterior é maior que o atual. */
export function discountPct(currentCents: number, previousCents: number | null | undefined): number | null {
  if (!previousCents || previousCents <= currentCents || currentCents <= 0) return null;
  return Math.round(((previousCents - currentCents) / previousCents) * 1000) / 10;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

export type PreviousPrice = { previousCents: number | null; basis: "loja" | "observado" | null; flags: string[] };

/**
 * Decide qual "preço anterior" pode ser mostrado. Nunca inventa:
 * - "loja": a própria loja informou um preço "de" maior que o atual (e plausível frente ao nosso histórico);
 * - "observado": mediana do que NÓS observamos nos últimos `windowDays` dias (mínimo de observações e dias de cobertura);
 * - senão, nenhum preço anterior (e portanto nenhum desconto).
 */
export function resolvePreviousPrice(a: {
  currentCents: number;
  declaredPreviousCents?: number | null;
  history: Observation[];
  now?: Date;
  windowDays?: number;
  minObservations?: number;
  minSpanDays?: number;
}): PreviousPrice {
  const now = a.now ?? new Date();
  const windowDays = a.windowDays ?? 30;
  const since = now.getTime() - windowDays * 86_400_000;
  const obs = a.history.filter((o) => o.at.getTime() >= since && o.at.getTime() <= now.getTime());
  const flags: string[] = [];
  const span = obs.length ? (Math.max(...obs.map((o) => o.at.getTime())) - Math.min(...obs.map((o) => o.at.getTime()))) / 86_400_000 : 0;
  const enough = obs.length >= (a.minObservations ?? 4) && span >= (a.minSpanDays ?? 3);
  const observedMax = obs.length ? Math.max(...obs.map((o) => o.priceCents)) : null;

  const declared = a.declaredPreviousCents ?? null;
  if (declared !== null) {
    if (declared <= a.currentCents) flags.push("preco_anterior_nao_maior");
    else if (declared > a.currentCents * 5) flags.push("preco_anterior_inflado");
    else if (enough && observedMax !== null && declared > observedMax * 1.5) flags.push("preco_anterior_inflado");
    else return { previousCents: declared, basis: "loja", flags };
  }
  if (enough) {
    const ref = median(obs.map((o) => o.priceCents));
    if (ref !== null && ref > a.currentCents) return { previousCents: ref, basis: "observado", flags };
  }
  return { previousCents: null, basis: null, flags };
}

// ───────── Cupom ─────────
export type Coupon = {
  code: string;
  kind: "percent" | "fixed";
  value: number; // percent: pontos (10 = 10%); fixed: centavos
  minPurchaseCents?: number | null;
  validFrom?: Date | null;
  validUntil?: Date | null;
  isActive: boolean;
  source: string; // de onde veio (loja, parceiro, manual): cupom sem origem não é válido
  maxDiscountCents?: number | null;
};
export type CouponResult = { valid: boolean; finalCents: number; savedCents: number; reason?: string };

const COUPON_CODE = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;
export const isValidCouponCode = (code: string): boolean => COUPON_CODE.test(code);

export function applyCoupon(priceCents: number, c: Coupon | null | undefined, now: Date = new Date()): CouponResult {
  const no = (reason: string): CouponResult => ({ valid: false, finalCents: priceCents, savedCents: 0, reason });
  if (!c) return no("sem_cupom");
  if (!c.isActive) return no("inativo");
  if (!c.source?.trim()) return no("sem_origem");
  if (!isValidCouponCode(c.code)) return no("codigo_invalido");
  if (c.validFrom && now < c.validFrom) return no("ainda_nao_vale");
  if (c.validUntil && now > c.validUntil) return no("expirado");
  if (c.minPurchaseCents && priceCents < c.minPurchaseCents) return no("abaixo_do_minimo");
  if (!(c.value > 0)) return no("valor_invalido");
  let saved = c.kind === "percent" ? Math.round((priceCents * c.value) / 100) : Math.round(c.value);
  if (c.kind === "percent" && c.value >= 100) return no("valor_invalido");
  if (c.maxDiscountCents) saved = Math.min(saved, c.maxDiscountCents);
  if (saved <= 0 || saved >= priceCents) return no("valor_invalido");
  return { valid: true, finalCents: priceCents - saved, savedCents: saved };
}

/** Preço por kg (centavos) quando o peso é conhecido; senão `null` (nunca estima). */
export function pricePerKgCents(priceCents: number, weightG: number | null | undefined): number | null {
  if (!weightG || weightG <= 0) return null;
  return Math.round((priceCents / weightG) * 1000);
}
