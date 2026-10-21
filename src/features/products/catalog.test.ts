import { describe, expect, it } from "vitest";
import { calculatePricing, type PricingInput } from "@/lib/pricing";
import type { FilamentRow } from "@/features/filaments/schema";
import type { PrinterRow } from "@/features/printers/schema";
import { DEFAULT_SETTINGS } from "@/features/settings/schema";
import { catalogCostsFromPricing, grossMarginPercent } from "./from-pricing";
import { costChanges, refreshInput, staleness } from "./refresh";

const printer = (over: Partial<PrinterRow> = {}): PrinterRow => ({
  id: "p", name: "P1", brand: null, model: null, purchase_price: 0, lifespan_hours: null, power_watts: 200,
  hourly_cost: 3, hourly_includes_energy: false, hourly_includes_wear: false, hourly_includes_fixed: false, wear_per_hour: 0.5, notes: null, ...over,
});
const filament = (over: Partial<FilamentRow> = {}): FilamentRow => ({
  id: "f", name: "PLA", brand: null, material: "PLA", color: "Preto", price_per_kg: 100, spool_weight_g: 1000, notes: null, ...over,
});
const settings = { ...DEFAULT_SETTINGS, energy_price_per_kwh: 1, monthly_fixed_costs: 160, productive_hours_per_month: 160 };

const inputFor = (p: PrinterRow, f: FilamentRow): PricingInput =>
  refreshInput(
    {
      quantity: 1, printMinutesPerUnit: 120, filamentGramsPerUnit: 100, filamentPricePerKg: 0,
      machine: { hourlyCost: 0, hourlyCostIncludes: { energy: false, wear: false, fixed: false }, powerWatts: 0, energyPricePerKwh: 0, wearPerHour: 0 },
      fixedCosts: { monthlyTotal: 0, allocation: "per_hour", productiveHoursPerMonth: 160, monthlyUnits: 0 },
      lossPercent: 5, labor: { hourlyRate: 20, minutesPerUnit: 6, setupMinutesPerBatch: 0 }, packagingPerUnit: 1,
      sale: { feePercent: 10, feeFixed: 0, taxPercent: 4 }, pricing: { mode: "margin", marginPercent: 30 },
    },
    p, f, settings,
  );

describe("catalogCostsFromPricing", () => {
  it("material + máquina + outros = custo de produção (fecha em centavos)", () => {
    const input = inputFor(printer(), filament());
    const r = calculatePricing(input);
    const c = catalogCostsFromPricing(input, r);
    expect(Math.round((c.material_cost + c.machine_cost + c.other_costs) * 100)).toBe(Math.round(c.production_cost * 100));
    expect(c.sale_price).toBe(r.suggestedUnitPrice);
    expect(c.material_cost).toBe(10);
    expect(c.weight_g).toBe(100);
    expect(c.print_minutes).toBe(120);
    expect(c.margin_basis).toBe("liquida");
  });
  it("peso/tempo zerados viram null (nunca inventar)", () => {
    const input = { ...inputFor(printer(), filament()), filamentGramsPerUnit: 0, printMinutesPerUnit: 0 };
    const c = catalogCostsFromPricing(input, calculatePricing(input));
    expect(c.weight_g).toBeNull();
    expect(c.print_minutes).toBeNull();
  });
});

describe("grossMarginPercent", () => {
  it("(preço − custo) / preço", () => {
    expect(grossMarginPercent(20, 40)).toBe(50);
    expect(grossMarginPercent(30, 40)).toBe(25);
    expect(grossMarginPercent(10, 0)).toBeNull();
  });
});

describe("recalcular com custos atualizados", () => {
  const saved = inputFor(printer(), filament());
  const result = calculatePricing(saved);

  it("sem mudança de custos o produto está em dia", () => {
    const s = staleness(saved, result.unitCost, result.suggestedUnitPrice, printer(), filament(), settings);
    expect(s.stale).toBe(false);
    expect(s.changes).toEqual([]);
  });

  it("filamento mais caro deixa o produto desatualizado, sem mexer no que é do produto", () => {
    const s = staleness(saved, result.unitCost, result.suggestedUnitPrice, printer(), filament({ price_per_kg: 150 }), settings);
    expect(s.stale).toBe(true);
    expect(s.changes.map((c) => c.label)).toEqual(["Preço do filamento"]);
    expect(s.newCost).toBeGreaterThan(result.unitCost);
    expect(s.priceDelta).toBeGreaterThan(0);
    const fresh = refreshInput(saved, printer(), filament({ price_per_kg: 150 }), settings);
    expect(fresh.filamentGramsPerUnit).toBe(saved.filamentGramsPerUnit);
    expect(fresh.pricing).toEqual(saved.pricing);
    expect(fresh.sale).toEqual(saved.sale);
    expect(fresh.labor).toEqual(saved.labor);
  });

  it("custo/hora da impressora e tarifa de energia também contam", () => {
    const fresh = refreshInput(saved, printer({ hourly_cost: 5 }), filament(), { ...settings, energy_price_per_kwh: 2 });
    expect(costChanges(saved, fresh).map((c) => c.label)).toEqual(["Custo/hora da impressora", "Tarifa de energia"]);
  });

  it("impressora ou filamento excluídos: mantém os valores salvos", () => {
    const fresh = refreshInput(saved, null, null, settings);
    expect(fresh.machine).toEqual(saved.machine);
    expect(fresh.filamentPricePerKg).toBe(saved.filamentPricePerKg);
  });
});
