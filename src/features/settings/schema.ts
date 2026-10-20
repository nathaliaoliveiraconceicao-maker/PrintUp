import { z } from "zod";
import { decimal } from "@/lib/forms";

export const settingsSchema = z
  .object({
    monthlyFixedCosts: decimal({ max: 1_000_000 }),
    fixedAllocation: z.enum(["per_hour", "per_unit"]),
    productiveHoursPerMonth: decimal({ max: 744 }),
    monthlyUnits: decimal({ max: 1_000_000 }),
    energyPricePerKwh: decimal({ max: 100 }),
    laborHourlyRate: decimal({ max: 10_000 }),
    lossPercent: decimal({ max: 100 }),
    saleFeePercent: decimal({ max: 99 }),
    saleFeeFixed: decimal({ max: 10_000 }),
    taxPercent: decimal({ max: 99 }),
    marginPercent: decimal({ max: 99 }),
  })
  .superRefine((v, ctx) => {
    if (v.saleFeePercent + v.taxPercent + v.marginPercent >= 100) {
      ctx.addIssue({ code: "custom", path: ["marginPercent"], message: "Taxas + impostos + margem devem somar menos de 100%." });
    }
  });

export type SettingsRow = {
  monthly_fixed_costs: number;
  fixed_allocation: "per_hour" | "per_unit";
  productive_hours_per_month: number;
  monthly_units: number;
  energy_price_per_kwh: number;
  labor_hourly_rate: number;
  loss_percent: number;
  sale_fee_percent: number;
  sale_fee_fixed: number;
  tax_percent: number;
  margin_percent: number;
};

/** Padrões usados enquanto o usuário não salvou configurações (espelham os defaults da tabela). */
export const DEFAULT_SETTINGS: SettingsRow = {
  monthly_fixed_costs: 0,
  fixed_allocation: "per_hour",
  productive_hours_per_month: 160,
  monthly_units: 0,
  energy_price_per_kwh: 0.9,
  labor_hourly_rate: 0,
  loss_percent: 5,
  sale_fee_percent: 0,
  sale_fee_fixed: 0,
  tax_percent: 0,
  margin_percent: 30,
};
