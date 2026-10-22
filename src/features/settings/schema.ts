import { z } from "zod";
import { checkbox, decimal } from "@/lib/forms";

/** Despesas mensais itemizadas (as mesmas chaves que o banco aceita em `cost_settings.fixed_items`). */
export const FIXED_ITEMS = [
  ["aluguel", "Aluguel"],
  ["softwares", "Softwares"],
  ["plataformas", "Plataformas"],
  ["tributos_fixos", "MEI / tributos fixos"],
  ["publicidade", "Publicidade"],
  ["condominio", "Condomínio"],
  ["outros", "Outros custos fixos"],
] as const;
export type FixedItemKey = (typeof FIXED_ITEMS)[number][0];

const itemFields = Object.fromEntries(FIXED_ITEMS.map(([k]) => [`item_${k}`, decimal({ max: 10_000_000 })])) as Record<`item_${FixedItemKey}`, ReturnType<typeof decimal>>;

export const settingsSchema = z
  .object({
    ...itemFields,
    expectedRevenue: decimal({ max: 100_000_000 }),
    fixedAllocation: z.enum(["revenue_percent", "per_hour", "per_unit"]),
    productiveHoursPerMonth: decimal({ max: 744 }),
    monthlyUnits: decimal({ max: 1_000_000 }),
    energyPricePerKwh: decimal({ max: 100 }),
    laborHourlyRate: decimal({ max: 10_000 }),
    packagingPerUnit: decimal({ max: 100_000 }),
    shippingPerUnit: decimal({ max: 100_000 }),
    lossPercent: decimal({ max: 100 }),
    pricingMode: z.enum(["margin", "markup"]),
    marginPercent: decimal({ max: 99 }),
    markupMultiplier: decimal({ min: 1, max: 101, empty: 1 }),
    taxPercent: decimal({ max: 99 }),
    saleFeePercent: decimal({ max: 99 }),
    saleFeeFixed: decimal({ max: 10_000 }),
    roundToReal: checkbox,
  })
  .superRefine((v, ctx) => {
    const total = FIXED_ITEMS.reduce((s, [k]) => s + (v as unknown as Record<string, number>)[`item_${k}`], 0);
    if (total > 0) {
      if (v.fixedAllocation === "revenue_percent" && !(v.expectedRevenue > 0)) ctx.addIssue({ code: "custom", path: ["expectedRevenue"], message: "Informe o faturamento previsto por mês para ratear as despesas." });
      if (v.fixedAllocation === "per_hour" && !(v.productiveHoursPerMonth > 0)) ctx.addIssue({ code: "custom", path: ["productiveHoursPerMonth"], message: "Informe as horas produtivas por mês." });
      if (v.fixedAllocation === "per_unit" && !(v.monthlyUnits > 0)) ctx.addIssue({ code: "custom", path: ["monthlyUnits"], message: "Informe as peças produzidas por mês." });
    }
    if (v.saleFeePercent + v.taxPercent >= 100) ctx.addIssue({ code: "custom", path: ["saleFeePercent"], message: "Taxas + impostos devem somar menos de 100%." });
    if (v.pricingMode === "margin" && v.saleFeePercent + v.taxPercent + v.marginPercent >= 100) {
      ctx.addIssue({ code: "custom", path: ["marginPercent"], message: "Taxas + impostos + margem devem somar menos de 100%." });
    }
  });

export const channelSchema = z.object({
  name: z.string().trim().min(1, "Dê um nome ao canal.").max(40, "Use até 40 caracteres."),
  feePercent: decimal({ max: 99 }),
  feeFixed: decimal({ max: 10_000 }),
});

export type ChannelRow = { id: string; name: string; fee_percent: number; fee_fixed: number; sort_order: number };

export type SettingsRow = {
  monthly_fixed_costs: number;
  fixed_allocation: "per_hour" | "per_unit" | "revenue_percent";
  productive_hours_per_month: number;
  monthly_units: number;
  energy_price_per_kwh: number;
  labor_hourly_rate: number;
  loss_percent: number;
  sale_fee_percent: number;
  sale_fee_fixed: number;
  tax_percent: number;
  margin_percent: number;
  packaging_per_unit: number;
  shipping_per_unit: number;
  fixed_items: Partial<Record<FixedItemKey, number>>;
  expected_revenue: number;
  pricing_mode: "margin" | "markup";
  markup_percent: number;
  price_rounding: "none" | "real";
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
  packaging_per_unit: 0,
  shipping_per_unit: 0,
  fixed_items: {},
  expected_revenue: 0,
  pricing_mode: "margin",
  markup_percent: 100,
  price_rounding: "none",
};

/** Linha do banco (possivelmente de antes da migration 0011) + padrões: nunca deixa campo indefinido. */
export const settingsOrDefault = (row: Partial<SettingsRow> | null | undefined): SettingsRow => ({ ...DEFAULT_SETTINGS, ...(row ?? {}), fixed_items: { ...(row?.fixed_items ?? {}) } });

/** Contas antigas guardavam só o total mensal: mostra esse valor em "Outros custos fixos" até o usuário detalhar. */
export function itemValues(s: SettingsRow): Record<FixedItemKey, number> {
  const out = Object.fromEntries(FIXED_ITEMS.map(([k]) => [k, Number(s.fixed_items?.[k] ?? 0)])) as Record<FixedItemKey, number>;
  const sum = Object.values(out).reduce((a, b) => a + b, 0);
  if (sum === 0 && s.monthly_fixed_costs > 0) out.outros = s.monthly_fixed_costs;
  return out;
}

/** Multiplicador do custo (ex.: 3×) ↔ markup percentual (3× = 200%). */
export const multiplierToMarkup = (x: number) => Math.round((x - 1) * 10_000) / 100;
export const markupToMultiplier = (pct: number) => Math.round((1 + pct / 100) * 100) / 100;
