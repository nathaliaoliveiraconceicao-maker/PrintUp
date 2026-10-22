/**
 * Tipos do motor de precificação. Todos os valores monetários estão em BRL (reais),
 * percentuais em pontos percentuais (ex.: 12 = 12%), tempos em minutos, massa em gramas.
 */

/** Quais componentes já estão embutidos no "custo da hora" informado pelo usuário. */
export interface HourlyCostIncludes {
  /** Energia elétrica já está no custo/hora. */
  energy: boolean;
  /** Desgaste e manutenção já estão no custo/hora. */
  wear: boolean;
  /** Custos fixos mensais (aluguel, internet...) já estão no custo/hora. */
  fixed: boolean;
}

/**
 * Como ratear os custos fixos mensais:
 *  - per_hour: por hora produtiva; per_unit: por peça produzida;
 *  - revenue_percent: percentual do faturamento previsto (custos fixos ÷ faturamento) aplicado sobre os custos diretos.
 */
export type FixedAllocation = "per_hour" | "per_unit" | "revenue_percent";

export interface PricingInput {
  /** Quantidade de unidades produzidas no lote (>= 1). */
  quantity: number;

  /** Tempo de impressão de UMA unidade, em minutos. */
  printMinutesPerUnit: number;

  /** Filamento consumido por UMA unidade, em gramas (peça + suportes + purga). */
  filamentGramsPerUnit: number;
  /** Preço do filamento por kg. */
  filamentPricePerKg: number;

  machine: {
    /** Custo da hora da impressora informado pelo usuário (0 = não usar). */
    hourlyCost: number;
    hourlyCostIncludes: HourlyCostIncludes;
    /** Potência média em watts durante a impressão. */
    powerWatts: number;
    /** Tarifa de energia, R$/kWh. */
    energyPricePerKwh: number;
    /** Desgaste + manutenção, R$ por hora de impressão. */
    wearPerHour: number;
  };

  fixedCosts: {
    /** Soma dos custos fixos mensais do negócio. */
    monthlyTotal: number;
    allocation: FixedAllocation;
    /** Horas produtivas por mês (usado em `per_hour`). */
    productiveHoursPerMonth: number;
    /** Unidades produzidas por mês (usado em `per_unit`). */
    monthlyUnits: number;
    /** Faturamento previsto por mês, em R$ (usado em `revenue_percent`). */
    expectedRevenue?: number;
  };

  /** Perdas e desperdícios (falhas), % sobre o custo direto de produção. */
  lossPercent: number;

  labor: {
    /** Valor da hora de trabalho manual. */
    hourlyRate: number;
    /** Minutos de mão de obra por unidade (remoção, lixa, pintura...). */
    minutesPerUnit: number;
    /** Minutos de preparo único do lote (fatiar, carregar). */
    setupMinutesPerBatch: number;
  };

  /** Embalagem, frete e acabamento, por unidade. */
  packagingPerUnit: number;

  /** `real`: arredonda o preço sugerido PARA CIMA, para o próximo real inteiro (taxas, impostos e lucro seguem o preço arredondado). */
  rounding?: "none" | "real";

  sale: {
    /** Taxa de venda (comissão de marketplace, gateway), % do preço. */
    feePercent: number;
    /** Taxa fixa por venda (R$ por unidade vendida). */
    feeFixed: number;
    /** Impostos, % do preço. */
    taxPercent: number;
  };

  pricing:
    | { mode: "margin"; /** % de lucro líquido sobre o PREÇO de venda */ marginPercent: number }
    | { mode: "markup"; /** % sobre o CUSTO */ markupPercent: number };
}

export interface CostBreakdown {
  filament: number;
  energy: number;
  machineHour: number;
  wear: number;
  fixed: number;
  losses: number;
  labor: number;
  packaging: number;
}

export interface PricingWarning {
  code:
    | "energy_ignored"
    | "wear_ignored"
    | "fixed_ignored"
    | "zero_cost"
    | "no_print_time";
  message: string;
}

export interface PricingResult {
  /** Custos do lote por componente. */
  batch: CostBreakdown;
  /** Custos por unidade por componente. */
  unit: CostBreakdown;
  batchCost: number;
  unitCost: number;

  /** Preço sugerido por unidade (arredondado em centavos). */
  suggestedUnitPrice: number;
  batchRevenue: number;

  /** Por unidade: taxas, impostos e lucro. */
  unitFees: number;
  unitTaxes: number;
  unitProfit: number;
  batchProfit: number;

  /** Lucro / preço de venda, em %. */
  marginPercent: number;
  /** Lucro / custo, em %. */
  markupPercent: number;

  warnings: PricingWarning[];
}
