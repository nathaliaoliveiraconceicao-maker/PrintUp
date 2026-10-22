import { z } from "zod";

const nonNeg = z.number().finite().min(0);
const pct = z.number().finite().min(0).max(100);

export const pricingInputSchema = z
  .object({
    quantity: z.number().int().min(1).max(100_000),
    printMinutesPerUnit: nonNeg,
    filamentGramsPerUnit: nonNeg,
    filamentPricePerKg: nonNeg,
    machine: z.object({
      hourlyCost: nonNeg,
      hourlyCostIncludes: z.object({
        energy: z.boolean(),
        wear: z.boolean(),
        fixed: z.boolean(),
      }),
      powerWatts: nonNeg,
      energyPricePerKwh: nonNeg,
      wearPerHour: nonNeg,
    }),
    fixedCosts: z.object({
      monthlyTotal: nonNeg,
      allocation: z.enum(["per_hour", "per_unit", "revenue_percent"]),
      productiveHoursPerMonth: nonNeg,
      monthlyUnits: nonNeg,
      expectedRevenue: nonNeg.optional().default(0),
    }),
    lossPercent: pct,
    labor: z.object({
      hourlyRate: nonNeg,
      minutesPerUnit: nonNeg,
      setupMinutesPerBatch: nonNeg,
    }),
    packagingPerUnit: nonNeg,
    rounding: z.enum(["none", "real"]).optional().default("none"),
    sale: z.object({
      feePercent: pct,
      feeFixed: nonNeg,
      taxPercent: pct,
    }),
    pricing: z.discriminatedUnion("mode", [
      z.object({ mode: z.literal("margin"), marginPercent: pct }),
      z.object({ mode: z.literal("markup"), markupPercent: z.number().finite().min(0).max(10_000) }),
    ]),
  })
  .superRefine((v, ctx) => {
    if (v.fixedCosts.monthlyTotal > 0 && !v.machine.hourlyCostIncludes.fixed) {
      if (v.fixedCosts.allocation === "per_hour" && v.fixedCosts.productiveHoursPerMonth <= 0) {
        ctx.addIssue({
          code: "custom",
          path: ["fixedCosts", "productiveHoursPerMonth"],
          message: "Informe as horas produtivas por mês para ratear o custo fixo.",
        });
      }
      if (v.fixedCosts.allocation === "revenue_percent" && v.fixedCosts.expectedRevenue <= 0) {
        ctx.addIssue({
          code: "custom",
          path: ["fixedCosts", "expectedRevenue"],
          message: "Informe o faturamento previsto por mês para ratear o custo fixo.",
        });
      }
      if (v.fixedCosts.allocation === "per_unit" && v.fixedCosts.monthlyUnits <= 0) {
        ctx.addIssue({
          code: "custom",
          path: ["fixedCosts", "monthlyUnits"],
          message: "Informe as peças produzidas por mês para ratear o custo fixo.",
        });
      }
    }
    if (v.pricing.mode === "margin") {
      const total = v.sale.feePercent + v.sale.taxPercent + v.pricing.marginPercent;
      if (total >= 100) {
        ctx.addIssue({
          code: "custom",
          path: ["pricing", "marginPercent"],
          message: "Taxas + impostos + margem somam 100% ou mais: não existe preço que feche a conta.",
        });
      }
    } else if (v.sale.feePercent + v.sale.taxPercent >= 100) {
      ctx.addIssue({
        code: "custom",
        path: ["sale", "feePercent"],
        message: "Taxas + impostos somam 100% ou mais.",
      });
    }
  });
