import { describe, expect, it } from "vitest";
import { calculateQuote, lineTotalCents, toCents } from "./calc";

const none = { type: "nenhum", value: 0 } as const;

describe("calculateQuote", () => {
  it("vários itens: soma das linhas = subtotal = total sem desconto", () => {
    const r = calculateQuote(
      [
        { quantity: 2, unitPrice: 40, discountPercent: 0 },
        { quantity: 1, unitPrice: 25.5, discountPercent: 0 },
        { quantity: 3, unitPrice: 9.9, discountPercent: 0 },
      ],
      none,
    );
    expect(r.lineTotals).toEqual([80, 25.5, 29.7]);
    expect(r.subtotal).toBe(135.2);
    expect(r.discountTotal).toBe(0);
    expect(r.total).toBe(135.2);
  });

  it("desconto percentual no total", () => {
    const r = calculateQuote([{ quantity: 1, unitPrice: 105, discountPercent: 0 }], { type: "percentual", value: 10 });
    expect(r.discountTotal).toBe(10.5);
    expect(r.total).toBe(94.5);
  });

  it("desconto em valor", () => {
    const r = calculateQuote([{ quantity: 2, unitPrice: 50, discountPercent: 0 }], { type: "valor", value: 15.5 });
    expect(r.total).toBe(84.5);
  });

  it("desconto por linha em % e arredondamento para centavos", () => {
    // 3 × 9,99 = 29,97 com 12,5% de desconto = 26,22375 -> 26,22
    const r = calculateQuote([{ quantity: 3, unitPrice: 9.99, discountPercent: 12.5 }], none);
    expect(r.lineTotals).toEqual([26.22]);
  });

  it("desconto maior que o subtotal é limitado (total nunca negativo)", () => {
    const r = calculateQuote([{ quantity: 1, unitPrice: 20, discountPercent: 0 }], { type: "valor", value: 50 });
    expect(r.discountCapped).toBe(true);
    expect(r.discountTotal).toBe(20);
    expect(r.total).toBe(0);
  });

  it("100% de desconto zera a linha", () => {
    expect(lineTotalCents({ quantity: 4, unitPrice: 12.34, discountPercent: 100 })).toBe(0);
  });

  it("total sempre = subtotal − desconto, sem resíduo de ponto flutuante", () => {
    const r = calculateQuote(
      [
        { quantity: 7, unitPrice: 0.1, discountPercent: 0 },
        { quantity: 3, unitPrice: 0.2, discountPercent: 0 },
      ],
      { type: "percentual", value: 33.33 },
    );
    expect(toCents(r.total)).toBe(toCents(r.subtotal) - toCents(r.discountTotal));
    expect(r.subtotal).toBe(1.3);
  });

  it("toCents é estável em casos clássicos", () => {
    expect(toCents(1.005)).toBe(101);
    expect(toCents(0.29)).toBe(29);
    expect(toCents(19.99)).toBe(1999);
  });
});
