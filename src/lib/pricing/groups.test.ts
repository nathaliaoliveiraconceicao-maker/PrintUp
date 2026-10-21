import { describe, expect, it } from "vitest";
import { calculatePricing } from "./calculate";
import { applyDiscount } from "./discount";
import { costGroups } from "./groups";
import type { PricingInput } from "./types";

const input: PricingInput = {
  quantity: 1, printMinutesPerUnit: 150, filamentGramsPerUnit: 80, filamentPricePerKg: 120,
  machine: { hourlyCost: 3, hourlyCostIncludes: { energy: false, wear: false, fixed: false }, powerWatts: 150, energyPricePerKwh: 0.9, wearPerHour: 1.5 },
  fixedCosts: { monthlyTotal: 480, allocation: "per_hour", productiveHoursPerMonth: 160, monthlyUnits: 0 },
  lossPercent: 5, labor: { hourlyRate: 30, minutesPerUnit: 10, setupMinutesPerBatch: 0 }, packagingPerUnit: 2,
  sale: { feePercent: 14, feeFixed: 4, taxPercent: 6 }, pricing: { mode: "margin", marginPercent: 30 },
};

describe("costGroups", () => {
  it("filamento + impressora + adicionais = custo unitário, em centavos", () => {
    const r = calculatePricing(input);
    const g = costGroups(r.unit, r.unitCost);
    expect(Math.round((g.filament + g.printer + g.additional) * 100)).toBe(Math.round(r.unitCost * 100));
    expect(g.filament).toBe(9.6);
  });
});

describe("applyDiscount", () => {
  const r = calculatePricing(input);
  it("0% de desconto reproduz o lucro do motor (±1 centavo)", () => {
    const d = applyDiscount(r.unitCost, r.suggestedUnitPrice, input.sale, 0);
    expect(d.price).toBe(r.suggestedUnitPrice);
    expect(Math.abs(d.profit - r.unitProfit)).toBeLessThanOrEqual(0.011);
  });
  it("desconto reduz preço, lucro e margem", () => {
    const d = applyDiscount(r.unitCost, r.suggestedUnitPrice, input.sale, 10);
    expect(d.price).toBeLessThan(r.suggestedUnitPrice);
    expect(d.profit).toBeLessThan(r.unitProfit);
    expect(d.marginPercent).toBeLessThan(r.marginPercent);
    expect(d.belowCost).toBe(false);
  });
  it("desconto grande leva a prejuízo e é sinalizado", () => {
    const d = applyDiscount(r.unitCost, r.suggestedUnitPrice, input.sale, 60);
    expect(d.profit).toBeLessThan(0);
    expect(d.belowCost).toBe(true);
  });
});
