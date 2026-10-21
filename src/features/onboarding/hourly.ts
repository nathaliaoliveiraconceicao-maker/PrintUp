import { round2 } from "@/lib/pricing";

/** Desgaste por hora a partir do preço de compra e da vida útil estimada. Sem vida útil válida: 0 (nunca inventa). */
export function wearPerHour(purchasePrice: number, lifespanHours: number): number {
  if (!(purchasePrice > 0) || !(lifespanHours > 0)) return 0;
  return round2(purchasePrice / lifespanHours);
}
