import { describe, expect, it } from "vitest";
import { couponFormSchema, courtesySchema, parsePage, parsePeriod, planFormSchema, settingsSchema, toBrtIso, toPlanPatch } from "./schema";

const NOW = new Date("2026-10-21T15:00:00Z");

describe("parsePeriod", () => {
  it("padrão: últimos 30 dias; presets conhecidos", () => {
    expect(parsePeriod({}, NOW).key).toBe("30d");
    expect(parsePeriod({ periodo: "7d" }, NOW).label).toBe("Últimos 7 dias");
    expect(parsePeriod({ periodo: "90d" }, NOW).from.getTime()).toBe(NOW.getTime() - 90 * 86_400_000);
  });
  it("personalizado: a data final entra inteira e usa horário de Brasília", () => {
    const p = parsePeriod({ periodo: "personalizado", de: "2026-10-01", ate: "2026-10-05" }, NOW);
    expect(p.from.toISOString()).toBe("2026-10-01T03:00:00.000Z");
    expect(p.to.toISOString()).toBe("2026-10-06T03:00:00.000Z");
  });
  it("entradas inválidas caem no padrão (sem lançar)", () => {
    for (const bad of [{ periodo: "personalizado", de: "x", ate: "y" }, { periodo: "personalizado", de: "2026-10-05", ate: "2026-10-01" }, { periodo: "personalizado", de: "2020-01-01", ate: "2026-10-01" }, { periodo: "'; drop table" }]) {
      expect(parsePeriod(bad, NOW).key).toBe("30d");
    }
  });
});

describe("parsePage", () => {
  it("só aceita páginas razoáveis", () => {
    expect(parsePage("3")).toEqual({ page: 3, limit: 25, offset: 50 });
    for (const bad of [undefined, "0", "-2", "abc", "99999999"]) expect(parsePage(bad).page).toBe(1);
  });
});

describe("plano", () => {
  const base = { name: " Pro ", description: "", price: "29,90", priceYearly: "", sortOrder: "20", isPublic: "on", isActive: "on",
    max_products: "200", max_printers: "3", max_filaments: "", max_imports_month: "50", max_pdf_month: "100", max_storage_mb: "1.000", feat_quotes: "on", feat_orders: "on" };
  it("converte reais em centavos, vazio em ilimitado e checkboxes em recursos", () => {
    const r = planFormSchema.safeParse(base);
    expect(r.success).toBe(true);
    const p = toPlanPatch(r.data!);
    expect(p).toMatchObject({ name: "Pro", price_cents: 2990, price_yearly_cents: null, is_public: true, highlight: false });
    expect((p.limits as Record<string, unknown>).max_filaments).toBeNull();
    expect((p.limits as Record<string, unknown>).max_storage_mb).toBe(1000);
    expect((p.features as Record<string, boolean>).quotes).toBe(true);
    expect((p.features as Record<string, boolean>).stock).toBe(false);
  });
  it("recusa nome vazio, limite negativo ou fracionado", () => {
    expect(planFormSchema.safeParse({ ...base, name: " " }).success).toBe(false);
    expect(planFormSchema.safeParse({ ...base, max_products: "-1" }).success).toBe(false);
    expect(planFormSchema.safeParse({ ...base, max_products: "2,5" }).success).toBe(false);
  });
});

describe("cupom, cortesia e configurações", () => {
  it("cupom: código em maiúsculas e e-mail minúsculo; recusa código curto", () => {
    const r = couponFormSchema.safeParse({ code: "volta-10", planCode: "pro", days: "14", restrictedEmail: "Ana@X.com", maxRedemptions: "", description: "" });
    expect(r.success && r.data.code).toBe("VOLTA-10");
    expect(r.success && r.data.restrictedEmail).toBe("ana@x.com");
    expect(r.success && r.data.maxRedemptions).toBeNull();
    expect(couponFormSchema.safeParse({ code: "ab", planCode: "pro", days: "14" }).success).toBe(false);
    expect(couponFormSchema.safeParse({ code: "OKOK1", planCode: "pro", days: "0" }).success).toBe(false);
  });
  it("datas do cupom em horário de Brasília", () => {
    expect(toBrtIso("2026-10-21")).toBe("2026-10-21T03:00:00.000Z");
    expect(toBrtIso("2026-10-21T10:30")).toBe("2026-10-21T13:30:00.000Z");
    expect(toBrtIso(undefined)).toBeNull();
  });
  it("cortesia exige id válido, dias e motivo", () => {
    const ok = { userId: "a0000000-0000-4000-8000-000000000003", planCode: "pro", days: "30", reason: "parceria" };
    expect(courtesySchema.safeParse(ok).success).toBe(true);
    expect(courtesySchema.safeParse({ ...ok, userId: "1; drop" }).success).toBe(false);
    expect(courtesySchema.safeParse({ ...ok, reason: "" }).success).toBe(false);
    expect(courtesySchema.safeParse({ ...ok, days: "400" }).success).toBe(false);
  });
  it("configurações: carência 0-30, e-mail e links https", () => {
    const ok = { billing_grace_days: "7", trial_enabled: "on", support_email: "a@b.co", terms_url: "https://x.com/t", privacy_url: "" };
    expect(settingsSchema.safeParse(ok).success).toBe(true);
    expect(settingsSchema.safeParse({ ...ok, billing_grace_days: "31" }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...ok, terms_url: "http://x.com" }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...ok, support_email: "sem-arroba" }).success).toBe(false);
  });
});
