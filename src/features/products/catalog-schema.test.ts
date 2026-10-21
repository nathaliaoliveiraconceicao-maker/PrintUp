import { describe, expect, it } from "vitest";
import { productFormSchema } from "./catalog-schema";

describe("productFormSchema", () => {
  it("aceita o formulário de um produto vindo de cálculo (sem campos de custo)", () => {
    const r = productFormSchema.safeParse({ name: "Vaso", stockQty: "5", salePrice: "57,74", sourceUrl: "https://makerworld.com/x" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.materialCost).toBe(0);
      expect(r.data.salePrice).toBe(57.74);
      expect(r.data.stockQty).toBe(5);
    }
  });
  it("campos em branco viram ausentes (nunca inventa peso, tempo ou preço)", () => {
    const r = productFormSchema.parse({ name: "Vaso", weightG: "", salePrice: "", category: "  " });
    expect(r.weightG).toBeUndefined();
    expect(r.salePrice).toBeUndefined();
    expect(r.category).toBeUndefined();
  });
  it("recusa nome vazio e links que não são http(s)", () => {
    expect(productFormSchema.safeParse({ name: "  " }).success).toBe(false);
    for (const url of ["ftp://x.com", "javascript:alert(1)", "makerworld.com", "https://"]) {
      expect(productFormSchema.safeParse({ name: "x", sourceUrl: url }).success).toBe(false);
    }
  });
  it("aceita números com vírgula e recusa negativos", () => {
    expect(productFormSchema.parse({ name: "x", materialCost: "1.234,50" }).materialCost).toBe(1234.5);
    expect(productFormSchema.safeParse({ name: "x", salePrice: "-1" }).success).toBe(false);
  });
});
