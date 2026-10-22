import { calculatePricing, round2, type PricingInput } from "@/lib/pricing";
import type { FilamentRow } from "@/features/filaments/schema";
import type { PrinterRow } from "@/features/printers/schema";
import type { SettingsRow } from "@/features/settings/schema";

/**
 * Reaplica os CUSTOS ATUAIS (impressora, filamento, energia, custos fixos) a uma entrada já salva.
 * Mantém o que é específico do produto: peso, tempo, quantidade, mão de obra, embalagem, perdas, taxas, impostos e margem.
 * Impressora ou filamento excluídos: mantém o valor que estava salvo.
 */
export function refreshInput(
  saved: PricingInput,
  printer: PrinterRow | null,
  filament: FilamentRow | null,
  settings: SettingsRow,
): PricingInput {
  return {
    ...saved,
    filamentPricePerKg: filament ? filament.price_per_kg : saved.filamentPricePerKg,
    machine: {
      hourlyCost: printer ? printer.hourly_cost : saved.machine.hourlyCost,
      hourlyCostIncludes: printer
        ? {
            energy: printer.hourly_includes_energy,
            wear: printer.hourly_includes_wear,
            fixed: printer.hourly_includes_fixed,
          }
        : saved.machine.hourlyCostIncludes,
      powerWatts: printer ? printer.power_watts : saved.machine.powerWatts,
      energyPricePerKwh: settings.energy_price_per_kwh,
      wearPerHour: printer ? printer.wear_per_hour : saved.machine.wearPerHour,
    },
    fixedCosts: {
      monthlyTotal: settings.monthly_fixed_costs,
      allocation: settings.fixed_allocation,
      productiveHoursPerMonth: settings.productive_hours_per_month,
      monthlyUnits: settings.monthly_units,
      expectedRevenue: settings.expected_revenue,
    },
    rounding: settings.price_rounding,
  };
}

export interface CostChange {
  label: string;
  before: number;
  after: number;
  unit: "brl" | "brl_kg" | "brl_h" | "brl_kwh" | "w" | "brl_month";
}

/** O que mudou nos custos de base entre o cálculo salvo e o estado atual (vazio = produto em dia). */
export function costChanges(saved: PricingInput, fresh: PricingInput): CostChange[] {
  const out: CostChange[] = [];
  const diff = (label: string, before: number, after: number, unit: CostChange["unit"]) => {
    if (Math.abs(before - after) > 1e-9) out.push({ label, before, after, unit });
  };
  diff("Preço do filamento", saved.filamentPricePerKg, fresh.filamentPricePerKg, "brl_kg");
  diff("Custo/hora da impressora", saved.machine.hourlyCost, fresh.machine.hourlyCost, "brl_h");
  diff("Potência da impressora", saved.machine.powerWatts, fresh.machine.powerWatts, "w");
  diff("Desgaste por hora", saved.machine.wearPerHour, fresh.machine.wearPerHour, "brl_h");
  diff("Tarifa de energia", saved.machine.energyPricePerKwh, fresh.machine.energyPricePerKwh, "brl_kwh");
  diff("Custos fixos mensais", saved.fixedCosts.monthlyTotal, fresh.fixedCosts.monthlyTotal, "brl_month");
  const s = saved.machine.hourlyCostIncludes;
  const f = fresh.machine.hourlyCostIncludes;
  if (s.energy !== f.energy || s.wear !== f.wear || s.fixed !== f.fixed) {
    out.push({ label: "O que o custo/hora já inclui", before: 0, after: 0, unit: "brl" });
  }
  return out;
}

export interface Staleness {
  stale: boolean;
  changes: CostChange[];
  newCost: number;
  newPrice: number;
  costDelta: number;
  priceDelta: number;
}

/** Compara o produto (custo e preço gravados) com o que daria recalcular hoje. */
export function staleness(
  saved: PricingInput,
  currentCost: number,
  currentPrice: number,
  printer: PrinterRow | null,
  filament: FilamentRow | null,
  settings: SettingsRow,
): Staleness {
  const fresh = refreshInput(saved, printer, filament, settings);
  const changes = costChanges(saved, fresh);
  const result = calculatePricing(fresh);
  return {
    stale: changes.length > 0 && (round2(result.unitCost) !== round2(currentCost) || round2(result.suggestedUnitPrice) !== round2(currentPrice)),
    changes,
    newCost: result.unitCost,
    newPrice: result.suggestedUnitPrice,
    costDelta: round2(result.unitCost - currentCost),
    priceDelta: round2(result.suggestedUnitPrice - currentPrice),
  };
}

/** Texto curto de uma mudança de custo, em pt-BR (ex.: "R$ 100,00/kg → R$ 150,00/kg"). */
export function describeChange(c: CostChange): string {
  if (c.label === "O que o custo/hora já inclui") return "mudou o que o custo/hora já inclui";
  const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const fmt = (n: number) => {
    switch (c.unit) {
      case "brl_kg": return `${brl(n)}/kg`;
      case "brl_h": return `${brl(n)}/h`;
      case "brl_kwh": return `${brl(n)}/kWh`;
      case "brl_month": return `${brl(n)}/mês`;
      case "w": return `${n.toLocaleString("pt-BR")} W`;
      default: return brl(n);
    }
  };
  return `${fmt(c.before)} → ${fmt(c.after)}`;
}
