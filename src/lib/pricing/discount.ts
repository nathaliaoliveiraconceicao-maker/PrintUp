import { round2 } from "./calculate";

export interface DiscountOutcome {
  /** Preço unitário depois do desconto. */
  price: number;
  /** Lucro unitário depois de custo, taxas e impostos (pode ser negativo). */
  profit: number;
  /** Lucro / preço com desconto, em %. */
  marginPercent: number;
  /** O desconto leva o lucro a zero ou menos. */
  belowCost: boolean;
}

/**
 * Efeito de um desconto dado ao cliente sobre o preço sugerido. É só uma simulação de leitura: não altera o
 * motor de cálculo nem o preço salvo. Taxa % e imposto % acompanham o novo preço; a taxa fixa não.
 */
export function applyDiscount(
  unitCost: number,
  suggestedPrice: number,
  sale: { feePercent: number; feeFixed: number; taxPercent: number },
  discountPercent: number,
): DiscountOutcome {
  const price = round2(suggestedPrice * (1 - discountPercent / 100));
  const profit = round2(price - unitCost - price * (sale.feePercent / 100) - sale.feeFixed - price * (sale.taxPercent / 100));
  return { price, profit, marginPercent: price > 0 ? (profit / price) * 100 : 0, belowCost: profit <= 0 };
}
