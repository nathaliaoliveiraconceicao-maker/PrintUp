import { describe, expect, it } from "vitest";
import { alertRuleSchema } from "./alert-schema";
import { materialFromCategory, planPriceChange } from "./calculator-link";
import { cronAuthorized } from "./cron-auth";

describe("integração com a calculadora", () => {
  it("filamento novo: só cadastra", () => {
    expect(planPriceChange(6300, null)).toEqual({ kind: "novo", newPerKg: 63 });
  });
  it("mesmo preço: nada a fazer", () => {
    expect(planPriceChange(6300, 63)).toEqual({ kind: "igual", current: 63 });
  });
  it("preço diferente: exige confirmação e mostra a economia por 100 g", () => {
    expect(planPriceChange(6000, 80)).toMatchObject({ kind: "atualizar", needsConfirmation: true, deltaPerKg: -20, savingPer100g: 2 });
  });
  it("preço maior que o atual também é sinalizado (economia negativa)", () => {
    expect(planPriceChange(9000, 80)).toMatchObject({ kind: "atualizar", savingPer100g: -1 });
  });
  it("mapeia o material para os valores aceitos pelo cadastro de filamentos", () => {
    expect(materialFromCategory("filamento-petg")).toBe("PETG");
    expect(materialFromCategory("filamento-pla", "NYLON")).toBe("Nylon");
    expect(materialFromCategory("acessorios")).toBe("Outro");
  });
});

describe("regras de alerta (formulário)", () => {
  it("preço máximo por kg vira centavos", () => {
    const r = alertRuleSchema.safeParse({ kind: "preco_abaixo", category: "filamento-pla", maxPricePerKg: "60,50" });
    expect(r.success && r.data.rule).toEqual({ kind: "preco_abaixo", category: "filamento-pla", maxPricePerKgCents: 6050 });
  });
  it("cada tipo exige o seu alvo", () => {
    expect(alertRuleSchema.safeParse({ kind: "preco_abaixo" }).success).toBe(false);
    expect(alertRuleSchema.safeParse({ kind: "desconto_acima" }).success).toBe(false);
    expect(alertRuleSchema.safeParse({ kind: "desconto_acima", minDiscount: "100" }).success).toBe(false);
    expect(alertRuleSchema.safeParse({ kind: "voltou_estoque" }).success).toBe(false);
    expect(alertRuleSchema.safeParse({ kind: "voltou_estoque", query: "pla marca" }).success).toBe(true);
  });
  it("recusa categoria inválida, valor negativo e preço por kg fora de filamentos", () => {
    expect(alertRuleSchema.safeParse({ kind: "preco_abaixo", maxPrice: "10", category: "invalida" }).success).toBe(false);
    expect(alertRuleSchema.safeParse({ kind: "preco_abaixo", maxPrice: "-5" }).success).toBe(false);
    expect(alertRuleSchema.safeParse({ kind: "preco_abaixo", maxPricePerKg: "50", category: "impressoras" }).success).toBe(false);
  });
});

describe("autorização da rotina agendada", () => {
  const secret = "um-segredo-bem-comprido-123";
  it("sem segredo configurado, recusa tudo", () => {
    expect(cronAuthorized(`Bearer ${secret}`, undefined)).toBeNull();
    expect(cronAuthorized("Bearer x", "curto")).toBeNull();
  });
  it("só aceita o cabeçalho exato", () => {
    expect(cronAuthorized(`Bearer ${secret}`, secret)).toBe(true);
    expect(cronAuthorized(`Bearer ${secret}x`, secret)).toBe(false);
    expect(cronAuthorized(secret, secret)).toBe(false);
    expect(cronAuthorized(null, secret)).toBe(false);
  });
});
