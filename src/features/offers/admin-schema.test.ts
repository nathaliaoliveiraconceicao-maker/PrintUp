import { describe, expect, it } from "vitest";
import { configHasSecret, conversionSchema, couponSchema, parseHosts, parseParams, settingsSchema, sourceSchema, storeSchema } from "./admin-schema";

const storeBase = { code: "shopee", name: "Shopee", kind: "afiliado", hosts: "shopee.com.br\ns.shopee.com.br", reliability: "80", params: "", required: "", template: "", disclosure: "", isActive: "on" };

describe("lojas (administração)", () => {
  it("valida domínios e converte em configuração de afiliado", () => {
    const r = storeSchema.safeParse({ ...storeBase, params: "aff=MEUID\nutm_campaign=printup", required: "aff" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toMatchObject({ allowed_hosts: ["shopee.com.br", "s.shopee.com.br"], affiliate_config: { params: { aff: "MEUID", utm_campaign: "printup" }, requiredParams: ["aff"] }, is_active: true });
  });
  it("recusa domínio inválido, IP, localhost e parâmetros malformados", () => {
    expect(parseHosts("localhost")).toBeNull();
    expect(parseHosts("10.0.0.1")).toBeNull();
    expect(parseHosts("https://Shopee.com.br/produto")).toEqual(["shopee.com.br"]);
    expect(parseParams("sem-igual")).toBeNull();
    expect(storeSchema.safeParse({ ...storeBase, hosts: "http://" }).success).toBe(false);
    expect(storeSchema.safeParse({ ...storeBase, code: "Loja Ruim!" }).success).toBe(false);
  });
  it("modelo de rastreador precisa de {url}, https e domínio permitido", () => {
    expect(storeSchema.safeParse({ ...storeBase, hosts: "shopee.com.br\nparceiro.com", template: "https://tracker.parceiro.com/c?u={url}" }).success).toBe(true);
    expect(storeSchema.safeParse({ ...storeBase, template: "https://tracker.parceiro.com/c?u={url}" }).success).toBe(false);
    expect(storeSchema.safeParse({ ...storeBase, template: "https://shopee.com.br/c" }).success).toBe(false);
    expect(storeSchema.safeParse({ ...storeBase, template: "http://shopee.com.br/c?u={url}" }).success).toBe(false);
  });
});

describe("fontes (administração)", () => {
  const base = { storeId: "11111111-1111-4111-8111-111111111111", connector: "feed_manual", name: "Feed", config: '{"feedUrl":"https://x.com/f.json"}', frequencyMinutes: "1440" };
  it("aceita JSON de configuração sem segredos", () => {
    expect(sourceSchema.safeParse(base).success).toBe(true);
  });
  it("recusa segredos na configuração (ficam nas variáveis de ambiente)", () => {
    expect(configHasSecret({ a: { apiKey: "x" } })).toBe(true);
    expect(sourceSchema.safeParse({ ...base, config: '{"token":"abc"}' }).success).toBe(false);
    expect(sourceSchema.safeParse({ ...base, config: '{"nested":{"client_secret":"x"}}' }).success).toBe(false);
  });
  it("recusa JSON inválido, array e frequência abaixo de 60 min", () => {
    expect(sourceSchema.safeParse({ ...base, config: "{quebrado" }).success).toBe(false);
    expect(sourceSchema.safeParse({ ...base, config: "[1]" }).success).toBe(false);
    expect(sourceSchema.safeParse({ ...base, frequencyMinutes: "10" }).success).toBe(false);
  });
});

describe("cupons, configurações e conversões (administração)", () => {
  it("cupom exige origem e percentual menor que 100", () => {
    const base = { storeId: "11111111-1111-4111-8111-111111111111", code: "print10", kind: "percent", value: "10", minPurchase: "", maxDiscount: "", validUntil: "2026-12-31", source: "newsletter da loja" };
    const r = couponSchema.safeParse(base);
    expect(r.success && r.data.code).toBe("PRINT10");
    expect(couponSchema.safeParse({ ...base, source: "" }).success).toBe(false);
    expect(couponSchema.safeParse({ ...base, value: "100" }).success).toBe(false);
    expect(couponSchema.safeParse({ ...base, code: "x" }).success).toBe(false);
  });
  it("configurações: notas coerentes e pesos válidos", () => {
    expect(settingsSchema.safeParse({}).success).toBe(true);
    expect(settingsSchema.safeParse({ minScorePublish: "50", minScoreReview: "60" }).success).toBe(false);
    expect(settingsSchema.safeParse({ minScorePublish: "150" }).success).toBe(false);
    const zero = Object.fromEntries(["discount", "history", "relevance", "availability", "store", "quality", "coupon", "freshness"].map((k) => [`w_${k}`, "0"]));
    expect(settingsSchema.safeParse(zero).success).toBe(false);
  });
  it("conversão informada ≠ confirmada", () => {
    const base = { storeId: "11111111-1111-4111-8111-111111111111", reportedOn: "2026-11-01", orders: "3", commission: "12,50", status: "informada" };
    expect(conversionSchema.safeParse(base).success).toBe(true);
    expect(conversionSchema.safeParse({ ...base, status: "paga" }).success).toBe(false);
  });
});
