import { describe, expect, it } from "vitest";
import { calculatePricing, marginToMarkup, markupToMargin, round2 } from "./calculate";
import { pricingInputSchema } from "./schema";
import type { PricingInput } from "./types";

const base = (over: Partial<PricingInput> = {}): PricingInput => ({
  quantity: 1,
  printMinutesPerUnit: 120,
  filamentGramsPerUnit: 100,
  filamentPricePerKg: 100,
  machine: {
    hourlyCost: 0,
    hourlyCostIncludes: { energy: false, wear: false, fixed: false },
    powerWatts: 0,
    energyPricePerKwh: 0,
    wearPerHour: 0,
  },
  fixedCosts: { monthlyTotal: 0, allocation: "per_hour", productiveHoursPerMonth: 0, monthlyUnits: 0 },
  lossPercent: 0,
  labor: { hourlyRate: 0, minutesPerUnit: 0, setupMinutesPerBatch: 0 },
  packagingPerUnit: 0,
  sale: { feePercent: 0, feeFixed: 0, taxPercent: 0 },
  pricing: { mode: "margin", marginPercent: 0 },
  ...over,
});

describe("round2", () => {
  it("arredonda para centavos", () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.675)).toBe(2.68);
    expect(round2(0)).toBe(0);
  });
});

describe("custos básicos", () => {
  it("filamento: 100 g a R$100/kg = R$10", () => {
    const r = calculatePricing(base());
    expect(r.unit.filament).toBe(10);
    expect(r.unitCost).toBe(10);
  });

  it("energia: 200 W por 2 h a R$1/kWh = R$0,40", () => {
    const r = calculatePricing(
      base({ machine: { ...base().machine, powerWatts: 200, energyPricePerKwh: 1 } }),
    );
    expect(r.unit.energy).toBe(0.4);
  });

  it("custo/hora e desgaste multiplicam pelas horas", () => {
    const r = calculatePricing(
      base({ machine: { ...base().machine, hourlyCost: 5, wearPerHour: 1 } }),
    );
    expect(r.unit.machineHour).toBe(10);
    expect(r.unit.wear).toBe(2);
  });

  it("mão de obra: setup é rateado no lote, minutos por unidade multiplicam", () => {
    const r = calculatePricing(
      base({
        quantity: 10,
        filamentGramsPerUnit: 0,
        labor: { hourlyRate: 30, minutesPerUnit: 6, setupMinutesPerBatch: 30 },
      }),
    );
    // (30 + 60) min = 1,5 h * 30 = 45 no lote
    expect(r.batch.labor).toBe(45);
    expect(r.unit.labor).toBe(4.5);
  });

  it("embalagem é por unidade", () => {
    const r = calculatePricing(base({ quantity: 4, filamentGramsPerUnit: 0, packagingPerUnit: 1.5 }));
    expect(r.batch.packaging).toBe(6);
  });
});

describe("lote", () => {
  it("custo do lote = unidades * custo unitário (sem setup)", () => {
    const r = calculatePricing(base({ quantity: 5 }));
    expect(r.batchCost).toBe(50);
    expect(r.unitCost).toBe(10);
  });
});

describe("rateio de custo fixo", () => {
  const fixed = (allocation: "per_hour" | "per_unit") => ({
    monthlyTotal: 600,
    allocation,
    productiveHoursPerMonth: 300,
    monthlyUnits: 200,
  });

  it("por hora produtiva: 600/300 = R$2/h * 2h = R$4", () => {
    const r = calculatePricing(base({ fixedCosts: fixed("per_hour") }));
    expect(r.unit.fixed).toBe(4);
  });

  it("por peça: 600/200 = R$3 por unidade", () => {
    const r = calculatePricing(base({ fixedCosts: fixed("per_unit") }));
    expect(r.unit.fixed).toBe(3);
  });
});

describe("anti-dupla-contagem", () => {
  const machine = {
    hourlyCost: 5,
    hourlyCostIncludes: { energy: true, wear: true, fixed: true },
    powerWatts: 200,
    energyPricePerKwh: 1,
    wearPerHour: 1,
  };

  it("não soma energia, desgaste e fixos quando já estão no custo/hora", () => {
    const r = calculatePricing(
      base({
        filamentGramsPerUnit: 0,
        machine,
        fixedCosts: { monthlyTotal: 600, allocation: "per_hour", productiveHoursPerMonth: 300, monthlyUnits: 0 },
      }),
    );
    expect(r.unit.energy).toBe(0);
    expect(r.unit.wear).toBe(0);
    expect(r.unit.fixed).toBe(0);
    expect(r.unitCost).toBe(10); // só 5 R$/h * 2 h
    expect(r.warnings.map((w) => w.code).sort()).toEqual(["energy_ignored", "fixed_ignored", "wear_ignored"]);
  });

  it("sem sobreposição, soma tudo", () => {
    const r = calculatePricing(
      base({
        filamentGramsPerUnit: 0,
        machine: { ...machine, hourlyCostIncludes: { energy: false, wear: false, fixed: false } },
      }),
    );
    expect(r.unitCost).toBe(12.4); // 10 + 0,40 + 2
    expect(r.warnings).toHaveLength(0);
  });
});

describe("perdas", () => {
  it("incidem só sobre custo direto de produção", () => {
    const r = calculatePricing(
      base({
        lossPercent: 10,
        packagingPerUnit: 5,
        labor: { hourlyRate: 60, minutesPerUnit: 30, setupMinutesPerBatch: 0 },
      }),
    );
    // direto = filamento 10 -> perda 1,00; mão de obra 30 e embalagem 5 não entram na base
    expect(r.unit.losses).toBe(1);
    expect(r.unitCost).toBe(46); // 10 + 1 + 30 + 5
  });
});

describe("preço por margem sobre o preço de venda", () => {
  it("20% de margem com custo 80: preço = 100, lucro 20", () => {
    const r = calculatePricing(
      base({ filamentPricePerKg: 800, pricing: { mode: "margin", marginPercent: 20 } }),
    );
    expect(r.unitCost).toBe(80);
    expect(r.suggestedUnitPrice).toBe(100);
    expect(r.unitProfit).toBe(20);
    expect(r.marginPercent).toBeCloseTo(20, 5);
    expect(r.markupPercent).toBeCloseTo(25, 5);
  });

  it("taxas, impostos e taxa fixa são deduzidos e a margem líquida se mantém", () => {
    const r = calculatePricing(
      base({
        filamentPricePerKg: 400, // custo 40
        sale: { feePercent: 14, feeFixed: 4, taxPercent: 6 },
        pricing: { mode: "margin", marginPercent: 20 },
      }),
    );
    // preço = (40+4)/(1-0,40) = 73,3333 -> 73,33
    expect(r.suggestedUnitPrice).toBe(73.33);
    expect(r.unitFees).toBe(14.27); // 73,33*0,14 + 4 = 14,2662
    expect(r.unitTaxes).toBe(4.4);
    expect(r.unitProfit).toBe(14.66); // 73,33 - 40 - 14,27 - 4,40
    expect(r.marginPercent).toBeCloseTo(20, 0);
  });

  it("o lucro nunca fica abaixo do pedido por mais de 1 centavo", () => {
    const r = calculatePricing(
      base({
        quantity: 7,
        filamentPricePerKg: 123.45,
        sale: { feePercent: 12.5, feeFixed: 3.5, taxPercent: 4 },
        pricing: { mode: "margin", marginPercent: 30 },
      }),
    );
    const target = r.suggestedUnitPrice * 0.3;
    expect(Math.abs(r.unitProfit - target)).toBeLessThan(0.03);
  });
});

describe("markup sobre o custo", () => {
  it("markup 100% com custo 10 = preço 20 (margem 50%)", () => {
    const r = calculatePricing(base({ pricing: { mode: "markup", markupPercent: 100 } }));
    expect(r.suggestedUnitPrice).toBe(20);
    expect(r.unitProfit).toBe(10);
    expect(r.marginPercent).toBeCloseTo(50, 5);
    expect(r.markupPercent).toBeCloseTo(100, 5);
  });

  it("com taxas, margem real fica abaixo do markup nominal", () => {
    const r = calculatePricing(
      base({
        sale: { feePercent: 10, feeFixed: 0, taxPercent: 10 },
        pricing: { mode: "markup", markupPercent: 100 },
      }),
    );
    // preço 20; taxas 2 + impostos 2; lucro 6
    expect(r.unitProfit).toBe(6);
    expect(r.markupPercent).toBeCloseTo(60, 5);
  });
});

describe("conversão margem <-> markup", () => {
  it("50% de margem = 100% de markup", () => {
    expect(marginToMarkup(50)).toBeCloseTo(100);
    expect(markupToMargin(100)).toBeCloseTo(50);
  });
  it("ida e volta", () => {
    expect(markupToMargin(marginToMarkup(23))).toBeCloseTo(23);
  });
  it("margem >= 100 é inválida", () => {
    expect(() => marginToMarkup(100)).toThrow(RangeError);
  });
});

describe("avisos", () => {
  it("avisa quando não há tempo de impressão ou custo", () => {
    const r = calculatePricing(base({ printMinutesPerUnit: 0, filamentGramsPerUnit: 0 }));
    expect(r.warnings.map((w) => w.code)).toEqual(expect.arrayContaining(["no_print_time", "zero_cost"]));
    expect(r.suggestedUnitPrice).toBe(0);
    expect(r.marginPercent).toBe(0);
  });
});

describe("validação (zod)", () => {
  it("aceita entrada válida", () => {
    expect(pricingInputSchema.safeParse(base()).success).toBe(true);
  });

  it("rejeita taxas + impostos + margem >= 100%", () => {
    const r = pricingInputSchema.safeParse(
      base({
        sale: { feePercent: 40, feeFixed: 0, taxPercent: 30 },
        pricing: { mode: "margin", marginPercent: 30 },
      }),
    );
    expect(r.success).toBe(false);
  });

  it("exige horas produtivas quando há custo fixo por hora", () => {
    const r = pricingInputSchema.safeParse(
      base({ fixedCosts: { monthlyTotal: 500, allocation: "per_hour", productiveHoursPerMonth: 0, monthlyUnits: 0 } }),
    );
    expect(r.success).toBe(false);
  });

  it("não exige rateio quando o custo/hora já inclui custos fixos", () => {
    const b = base();
    const r = pricingInputSchema.safeParse({
      ...b,
      machine: { ...b.machine, hourlyCostIncludes: { energy: false, wear: false, fixed: true } },
      fixedCosts: { monthlyTotal: 500, allocation: "per_hour", productiveHoursPerMonth: 0, monthlyUnits: 0 },
    });
    expect(r.success).toBe(true);
  });

  it("rejeita valores negativos e quantidade fracionada", () => {
    expect(pricingInputSchema.safeParse(base({ filamentPricePerKg: -1 })).success).toBe(false);
    expect(pricingInputSchema.safeParse(base({ quantity: 1.5 })).success).toBe(false);
  });
});
