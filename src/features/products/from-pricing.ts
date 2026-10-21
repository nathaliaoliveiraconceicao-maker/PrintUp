import { round2, type PricingInput, type PricingResult } from "@/lib/pricing";

export interface CatalogCosts {
  production_cost: number;
  material_cost: number;
  machine_cost: number;
  other_costs: number;
  sale_price: number;
  margin_percent: number;
  margin_basis: "liquida";
  weight_g: number | null;
  print_minutes: number | null;
}

/**
 * Valores do catálogo a partir de um cálculo. Material = filamento; máquina = hora + energia + desgaste;
 * outros = o que sobra do custo total (fixos, perdas, mão de obra, embalagem), de modo que
 * material + máquina + outros = custo de produção, sempre, sem diferença de centavos.
 */
export function catalogCostsFromPricing(input: PricingInput, result: PricingResult): CatalogCosts {
  const material = round2(result.unit.filament);
  const machine = round2(result.unit.machineHour + result.unit.energy + result.unit.wear);
  const other = Math.max(0, round2(result.unitCost - material - machine));
  return {
    production_cost: result.unitCost,
    material_cost: material,
    machine_cost: machine,
    other_costs: other,
    sale_price: result.suggestedUnitPrice,
    margin_percent: round2(result.marginPercent),
    margin_basis: "liquida",
    weight_g: input.filamentGramsPerUnit > 0 ? input.filamentGramsPerUnit : null,
    print_minutes: input.printMinutesPerUnit > 0 ? input.printMinutesPerUnit : null,
  };
}

/** Margem bruta, sobre o preço e sem taxas/impostos: (preço − custo) / preço. Para cadastro manual. */
export function grossMarginPercent(cost: number, price: number): number | null {
  if (!(price > 0)) return null;
  return round2(((price - cost) / price) * 100);
}
