/** Rótulos (pt-BR) dos componentes de custo, na ordem de exibição. */
export const COST_LABELS: [keyof import("./types").CostBreakdown, string][] = [
  ["filament", "Filamento"],
  ["machineHour", "Hora da máquina"],
  ["energy", "Energia"],
  ["wear", "Desgaste e manutenção"],
  ["fixed", "Custos fixos (rateio)"],
  ["losses", "Perdas e desperdício"],
  ["labor", "Mão de obra"],
  ["packaging", "Embalagem e acabamento"],
];
