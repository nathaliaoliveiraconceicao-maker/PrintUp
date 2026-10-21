/**
 * Contas do orçamento em CENTAVOS inteiros (nada de ponto flutuante acumulando erro).
 * Reais entram e saem com 2 casas; a soma dos itens sempre fecha com o subtotal.
 * O servidor refaz estas contas antes de gravar: o total que o navegador mostrou nunca é confiado.
 */
export type DiscountType = "nenhum" | "percentual" | "valor";

export interface QuoteLineInput {
  quantity: number;
  /** Preço unitário aplicado, em reais. */
  unitPrice: number;
  /** Desconto da linha, em pontos percentuais (10 = 10%). */
  discountPercent: number;
}

export interface QuoteDiscountInput {
  type: DiscountType;
  /** % (0–100) quando `percentual`; reais quando `valor`. */
  value: number;
}

export interface QuoteTotals {
  /** Total de cada linha em reais, na mesma ordem da entrada. */
  lineTotals: number[];
  subtotal: number;
  discountTotal: number;
  total: number;
  /** Desconto pedido maior que o subtotal foi limitado ao subtotal. */
  discountCapped: boolean;
}

export const toCents = (reais: number): number => Math.round(reais * 100 + Math.sign(reais) * 1e-9);
export const fromCents = (cents: number): number => cents / 100;

/** Divisão inteira com arredondamento "meio para cima" (valores não negativos). */
const roundDiv = (num: number, den: number): number => Math.floor((2 * num + den) / (2 * den));

export function lineTotalCents(line: QuoteLineInput): number {
  const gross = toCents(line.unitPrice) * line.quantity;
  const pctBasisPoints = Math.round(line.discountPercent * 100); // 12,5% => 1250
  return roundDiv(gross * (10_000 - pctBasisPoints), 10_000);
}

export function calculateQuote(lines: QuoteLineInput[], discount: QuoteDiscountInput): QuoteTotals {
  const lineCents = lines.map(lineTotalCents);
  const subtotalC = lineCents.reduce((a, b) => a + b, 0);

  let discountC = 0;
  if (discount.type === "percentual") discountC = roundDiv(subtotalC * Math.round(discount.value * 100), 10_000);
  else if (discount.type === "valor") discountC = toCents(discount.value);
  const discountCapped = discountC > subtotalC;
  if (discountCapped) discountC = subtotalC;

  return {
    lineTotals: lineCents.map(fromCents),
    subtotal: fromCents(subtotalC),
    discountTotal: fromCents(discountC),
    total: fromCents(subtotalC - discountC),
    discountCapped,
  };
}
