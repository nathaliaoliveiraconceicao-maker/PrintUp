import { describe, expect, it } from "vitest";
import { savePricingSchema } from "./schema";

const input = {
  quantity: 1,
  printMinutesPerUnit: 60,
  filamentGramsPerUnit: 50,
  filamentPricePerKg: 100,
  machine: { hourlyCost: 0, hourlyCostIncludes: { energy: false, wear: false, fixed: false }, powerWatts: 0, energyPricePerKwh: 0, wearPerHour: 0 },
  fixedCosts: { monthlyTotal: 0, allocation: "per_hour", productiveHoursPerMonth: 0, monthlyUnits: 0 },
  lossPercent: 0,
  labor: { hourlyRate: 0, minutesPerUnit: 0, setupMinutesPerBatch: 0 },
  packagingPerUnit: 0,
  sale: { feePercent: 0, feeFixed: 0, taxPercent: 0 },
  pricing: { mode: "margin", marginPercent: 30 },
};

describe("savePricingSchema", () => {
  it("aceita produto novo", () => {
    expect(savePricingSchema.safeParse({ newProductName: "  Vaso  ", input }).success).toBe(true);
  });
  it("aceita produto existente", () => {
    const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    expect(savePricingSchema.safeParse({ productId: id, input }).success).toBe(true);
  });
  it("exige um ou outro, nunca os dois nem nenhum", () => {
    const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    expect(savePricingSchema.safeParse({ input }).success).toBe(false);
    expect(savePricingSchema.safeParse({ productId: id, newProductName: "x", input }).success).toBe(false);
  });
  it("rejeita entrada financeira inválida (margem + taxas ≥ 100%)", () => {
    const bad = { ...input, sale: { feePercent: 60, feeFixed: 0, taxPercent: 20 }, pricing: { mode: "margin", marginPercent: 30 } };
    expect(savePricingSchema.safeParse({ newProductName: "x", input: bad }).success).toBe(false);
  });
  it("rejeita id que não é uuid", () => {
    expect(savePricingSchema.safeParse({ productId: "abc", input }).success).toBe(false);
  });
});
