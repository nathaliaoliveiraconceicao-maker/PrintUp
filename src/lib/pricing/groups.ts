import { round2 } from "./calculate";
import type { CostBreakdown } from "./types";

export interface CostGroups {
  filament: number;
  /** Hora da máquina + energia + desgaste/manutenção. */
  printer: number;
  /** Custos fixos rateados + perdas + mão de obra + embalagem/acabamento. */
  additional: number;
  total: number;
}

/**
 * Agrupa o custo por unidade em 3 blocos para exibição. `additional` é o que sobra do total, então
 * filamento + impressora + adicionais = total sempre, sem diferença de centavos.
 */
export function costGroups(unit: CostBreakdown, unitCost: number): CostGroups {
  const filament = round2(unit.filament);
  const printer = round2(unit.machineHour + unit.energy + unit.wear);
  const additional = Math.max(0, round2(unitCost - filament - printer));
  return { filament, printer, additional, total: unitCost };
}
