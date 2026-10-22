import { describe, expect, it } from "vitest";
import { channelSchema, DEFAULT_SETTINGS, itemValues, markupToMultiplier, multiplierToMarkup, settingsOrDefault, settingsSchema } from "./schema";

const base = {
  item_aluguel: "300", item_softwares: "100", item_plataformas: "80", item_tributos_fixos: "", item_publicidade: "", item_condominio: "", item_outros: "",
  expectedRevenue: "8000", fixedAllocation: "revenue_percent", productiveHoursPerMonth: "160", monthlyUnits: "0", energyPricePerKwh: "0,90", laborHourlyRate: "30",
  packagingPerUnit: "1,50", shippingPerUnit: "0", lossPercent: "5", pricingMode: "margin", marginPercent: "30", markupMultiplier: "3", taxPercent: "6", saleFeePercent: "0", saleFeeFixed: "0",
};

describe("settingsSchema", () => {
  it("aceita números com vírgula e campos de despesa vazios", () => {
    const r = settingsSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.item_aluguel).toBe(300);
      expect(r.data.item_outros).toBe(0);
      expect(r.data.packagingPerUnit).toBe(1.5);
      expect(r.data.roundToReal).toBe(false);
    }
  });
  it("rateio pelo faturamento exige faturamento previsto quando há despesas", () => {
    const r = settingsSchema.safeParse({ ...base, expectedRevenue: "" });
    expect(r.success).toBe(false);
    expect(settingsSchema.safeParse({ ...base, expectedRevenue: "", item_aluguel: "", item_softwares: "", item_plataformas: "" }).success).toBe(true);
  });
  it("rateio por hora ou por peça exige o respectivo divisor", () => {
    expect(settingsSchema.safeParse({ ...base, fixedAllocation: "per_hour", productiveHoursPerMonth: "0" }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...base, fixedAllocation: "per_unit", monthlyUnits: "0" }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...base, fixedAllocation: "per_unit", monthlyUnits: "100" }).success).toBe(true);
  });
  it("taxas + impostos + margem devem somar menos de 100%", () => {
    expect(settingsSchema.safeParse({ ...base, saleFeePercent: "50", taxPercent: "30", marginPercent: "30" }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...base, pricingMode: "markup", saleFeePercent: "50", taxPercent: "30", marginPercent: "30" }).success).toBe(true);
  });
  it("recusa valores negativos e modo desconhecido", () => {
    expect(settingsSchema.safeParse({ ...base, item_aluguel: "-1" }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...base, pricingMode: "outro" }).success).toBe(false);
  });
});

describe("canais de venda", () => {
  it("exige nome e limita a taxa", () => {
    expect(channelSchema.safeParse({ name: "Shopee", feePercent: "20", feeFixed: "4" }).success).toBe(true);
    expect(channelSchema.safeParse({ name: "  ", feePercent: "20", feeFixed: "0" }).success).toBe(false);
    expect(channelSchema.safeParse({ name: "X", feePercent: "100", feeFixed: "0" }).success).toBe(false);
  });
});

describe("compatibilidade com contas antigas", () => {
  it("total antigo aparece em 'Outros custos fixos' até ser detalhado", () => {
    const old = settingsOrDefault({ monthly_fixed_costs: 480 });
    expect(itemValues(old).outros).toBe(480);
    expect(itemValues({ ...old, fixed_items: { aluguel: 300 } }).outros).toBe(0);
  });
  it("linha ausente ou antiga recebe os padrões", () => {
    expect(settingsOrDefault(null)).toEqual(DEFAULT_SETTINGS);
    expect(settingsOrDefault({ margin_percent: 40 }).packaging_per_unit).toBe(DEFAULT_SETTINGS.packaging_per_unit);
  });
  it("multiplicador ↔ markup", () => {
    expect(multiplierToMarkup(3)).toBe(200);
    expect(markupToMultiplier(200)).toBe(3);
  });
});
