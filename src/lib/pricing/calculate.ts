import type {
  CostBreakdown,
  PricingInput,
  PricingResult,
  PricingWarning,
} from "./types";

/** Arredonda para centavos (half away from zero, tolerante a erro de ponto flutuante). */
export function round2(n: number): number {
  return Math.sign(n) * (Math.round(Math.abs(n) * 100 + 1e-9) / 100);
}

const sumBreakdown = (b: CostBreakdown): number =>
  b.filament + b.energy + b.machineHour + b.wear + b.fixed + b.losses + b.labor + b.packaging;

/**
 * Calcula custo e preço sugerido de um lote.
 *
 * Regras anti-dupla-contagem:
 *  - Se o custo/hora informado já inclui energia, desgaste ou custos fixos,
 *    o componente correspondente NÃO é somado de novo (e um aviso é emitido
 *    quando o usuário preencheu um valor que acabou ignorado).
 *  - Perdas incidem apenas sobre o custo direto de produção (filamento + máquina + energia
 *    + desgaste), nunca sobre mão de obra, embalagem ou rateio fixo.
 *
 * Preço:
 *  - modo margem: preço = (custo + taxa fixa) / (1 - taxa% - imposto% - margem%)
 *    A margem é lucro líquido sobre o PREÇO de venda.
 *  - modo markup: preço = custo * (1 + markup%). Taxas e impostos saem do preço, então
 *    a margem real resultante é menor que o markup e é reportada.
 *
 * Não valida entrada; use `pricingInputSchema` antes.
 */
export function calculatePricing(input: PricingInput): PricingResult {
  const { quantity: qty, machine, fixedCosts, labor, sale } = input;
  const warnings: PricingWarning[] = [];

  const batchHours = (input.printMinutesPerUnit * qty) / 60;
  if (input.printMinutesPerUnit <= 0) {
    warnings.push({
      code: "no_print_time",
      message: "Tempo de impressão zerado: custos de máquina e energia ficam em R$ 0,00.",
    });
  }

  // Material
  const filament = (input.filamentGramsPerUnit * qty / 1000) * input.filamentPricePerKg;

  // Máquina
  const machineHour = machine.hourlyCost * batchHours;

  const energyPerHour = (machine.powerWatts / 1000) * machine.energyPricePerKwh;
  let energy = energyPerHour * batchHours;
  if (machine.hourlyCostIncludes.energy) {
    if (energy > 0) {
      warnings.push({
        code: "energy_ignored",
        message: "Energia ignorada: o custo/hora informado já a inclui.",
      });
    }
    energy = 0;
  }

  let wear = machine.wearPerHour * batchHours;
  if (machine.hourlyCostIncludes.wear) {
    if (wear > 0) {
      warnings.push({
        code: "wear_ignored",
        message: "Desgaste/manutenção ignorado: o custo/hora informado já o inclui.",
      });
    }
    wear = 0;
  }

  // Mão de obra e embalagem
  const laborHours = (labor.setupMinutesPerBatch + labor.minutesPerUnit * qty) / 60;
  const laborCost = laborHours * labor.hourlyRate;
  const packaging = input.packagingPerUnit * qty;

  // Custos fixos
  let fixed = 0;
  if (fixedCosts.monthlyTotal > 0) {
    if (machine.hourlyCostIncludes.fixed) {
      warnings.push({
        code: "fixed_ignored",
        message: "Custos fixos ignorados: o custo/hora informado já os inclui.",
      });
    } else if (fixedCosts.allocation === "per_hour") {
      fixed =
        fixedCosts.productiveHoursPerMonth > 0
          ? (fixedCosts.monthlyTotal / fixedCosts.productiveHoursPerMonth) * batchHours
          : 0;
    } else if (fixedCosts.allocation === "revenue_percent") {
      // Custos fixos ÷ faturamento previsto = quanto cada R$ de custo direto "carrega" de despesa fixa.
      const expected = fixedCosts.expectedRevenue ?? 0;
      fixed = expected > 0 ? (filament + machineHour + energy + wear + laborCost + packaging) * (fixedCosts.monthlyTotal / expected) : 0;
    } else {
      fixed =
        fixedCosts.monthlyUnits > 0
          ? (fixedCosts.monthlyTotal / fixedCosts.monthlyUnits) * qty
          : 0;
    }
  }

  // Perdas: só sobre o custo direto de produção
  const directProduction = filament + machineHour + energy + wear;
  const losses = directProduction * (input.lossPercent / 100);

  const batch: CostBreakdown = {
    filament,
    energy,
    machineHour,
    wear,
    fixed,
    losses,
    labor: laborCost,
    packaging,
  };
  const batchCost = sumBreakdown(batch);
  const unitCostRaw = batchCost / qty;

  if (batchCost <= 0) {
    warnings.push({ code: "zero_cost", message: "Custo total zerado: confira os dados informados." });
  }

  // Preço por unidade
  const feeRate = sale.feePercent / 100;
  const taxRate = sale.taxPercent / 100;
  let unitPriceRaw: number;
  if (input.pricing.mode === "margin") {
    const denom = 1 - feeRate - taxRate - input.pricing.marginPercent / 100;
    unitPriceRaw = (unitCostRaw + sale.feeFixed) / denom;
  } else {
    unitPriceRaw = unitCostRaw * (1 + input.pricing.markupPercent / 100);
  }

  // Arredondar para o próximo real inteiro (opcional): as taxas e o lucro abaixo já saem do preço arredondado.
  const suggestedUnitPrice = input.rounding === "real" ? Math.max(0, Math.ceil(unitPriceRaw - 1e-9)) + 0 : round2(unitPriceRaw);
  // Taxas e lucro derivados do preço JÁ arredondado, para fechar a conta em centavos.
  const unitFees = round2(suggestedUnitPrice * feeRate + sale.feeFixed);
  const unitTaxes = round2(suggestedUnitPrice * taxRate);
  const unitCost = round2(unitCostRaw);
  const unitProfit = round2(suggestedUnitPrice - unitCostRaw - unitFees - unitTaxes);

  const perUnit = (b: CostBreakdown): CostBreakdown => ({
    filament: round2(b.filament / qty),
    energy: round2(b.energy / qty),
    machineHour: round2(b.machineHour / qty),
    wear: round2(b.wear / qty),
    fixed: round2(b.fixed / qty),
    losses: round2(b.losses / qty),
    labor: round2(b.labor / qty),
    packaging: round2(b.packaging / qty),
  });

  const roundedBatch: CostBreakdown = {
    filament: round2(batch.filament),
    energy: round2(batch.energy),
    machineHour: round2(batch.machineHour),
    wear: round2(batch.wear),
    fixed: round2(batch.fixed),
    losses: round2(batch.losses),
    labor: round2(batch.labor),
    packaging: round2(batch.packaging),
  };

  return {
    batch: roundedBatch,
    unit: perUnit(batch),
    batchCost: round2(batchCost),
    unitCost,
    suggestedUnitPrice,
    batchRevenue: round2(suggestedUnitPrice * qty),
    unitFees,
    unitTaxes,
    unitProfit,
    batchProfit: round2(unitProfit * qty),
    marginPercent: suggestedUnitPrice > 0 ? (unitProfit / suggestedUnitPrice) * 100 : 0,
    markupPercent: unitCostRaw > 0 ? (unitProfit / unitCostRaw) * 100 : 0,
    warnings,
  };
}

/** Converte markup (sobre custo) em margem (sobre preço): m = k / (1 + k). */
export function markupToMargin(markupPercent: number): number {
  const k = markupPercent / 100;
  return (k / (1 + k)) * 100;
}

/** Converte margem (sobre preço) em markup (sobre custo): k = m / (1 - m). Exige margem < 100. */
export function marginToMarkup(marginPercent: number): number {
  if (marginPercent >= 100) throw new RangeError("Margem deve ser menor que 100%.");
  const m = marginPercent / 100;
  return (m / (1 - m)) * 100;
}

export const emptyBreakdown = (): CostBreakdown => ({
  filament: 0, energy: 0, machineHour: 0, wear: 0, fixed: 0, losses: 0, labor: 0, packaging: 0,
});
