import { pricePerKgCents } from "./pricing";
import { extractSpecs, type Specs } from "./specs";

export type Comparable = {
  category: string;
  brand?: string | null;
  model?: string | null;
  title: string;
  specs?: Specs;
  priceCents: number;
  shippingCents?: number | null;
  couponSavedCents?: number | null;
  /** Chave canônica já calculada (gravada no produto): quando existe, é ela que decide a equivalência. */
  key?: string | null;
};

const norm = (s: string | null | undefined) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Chave canônica: só produtos com a MESMA chave podem ser comparados como equivalentes. `null` = dados insuficientes. */
export function canonicalKey(p: Pick<Comparable, "category" | "brand" | "model" | "title"> & { specs?: Specs }): string | null {
  const brand = norm(p.brand);
  if (!brand) return null; // sem marca não há equivalência segura
  const specs = p.specs ?? extractSpecs(p.title);
  if (p.category.startsWith("filamento-")) {
    if (!specs.material || !specs.weightG) return null;
    return ["fil", brand, specs.material, specs.variant ?? "-", specs.diameterMm ?? "?", specs.weightG, specs.unitCount ?? 1].join("|");
  }
  const model = norm(p.model);
  if (!model) return null; // impressoras/peças: modelo é obrigatório
  return [p.category, brand, model, specs.weightG ?? "-", specs.variant ?? "-"].join("|");
}

const keyOf = (c: Comparable): string | null => c.key ?? canonicalKey(c);

export const areEquivalent = (a: Comparable, b: Comparable): boolean => {
  const ka = keyOf(a);
  return ka !== null && ka === keyOf(b);
};

/** Preço efetivo: preço − cupom + frete (frete só entra quando conhecido nas DUAS pontas, senão compara sem frete e avisa). */
export function effectivePriceCents(p: Comparable): number {
  return p.priceCents - (p.couponSavedCents ?? 0) + (p.shippingCents ?? 0);
}

export type CompareRow<T extends Comparable> = { item: T; effectiveCents: number; perKgCents: number | null; shippingKnown: boolean };

/** Ordena do mais barato ao mais caro, apenas entre equivalentes ao primeiro item. */
export function compareEquivalents<T extends Comparable>(base: T, others: T[]): { rows: CompareRow<T>[]; shippingComparable: boolean } {
  const group = [base, ...others.filter((o) => o !== base && areEquivalent(base, o))];
  const shippingComparable = group.every((g) => g.shippingCents !== null && g.shippingCents !== undefined);
  const rows = group.map((g) => {
    const eff = shippingComparable ? effectivePriceCents(g) : g.priceCents - (g.couponSavedCents ?? 0);
    const w = (g.specs ?? extractSpecs(g.title)).weightG;
    return { item: g, effectiveCents: eff, perKgCents: pricePerKgCents(eff, w), shippingKnown: g.shippingCents !== null && g.shippingCents !== undefined };
  });
  rows.sort((x, y) => x.effectiveCents - y.effectiveCents);
  return { rows, shippingComparable };
}
