import { describe, expect, it } from "vitest";
import { marginStepSchema, costStepSchema, filamentStepSchema, printerStepSchema } from "./schema";
import { wearPerHour } from "./hourly";

const ID = "11111111-1111-4111-8111-111111111111";
const cost = { printerId: ID, mode: "direto", hourlyCost: 0, includesEnergy: true, includesWear: true, purchasePrice: 0, lifespanHours: 0, powerWatts: 0 };

describe("wearPerHour", () => {
  it("preço ÷ vida útil, arredondado em centavos", () => {
    expect(wearPerHour(1500, 1000)).toBe(1.5);
    expect(wearPerHour(2999, 5000)).toBe(0.6);
  });
  it("sem dados válidos não inventa valor", () => {
    expect(wearPerHour(0, 1000)).toBe(0);
    expect(wearPerHour(1500, 0)).toBe(0);
  });
});

describe("validação dos passos", () => {
  it("custo por hora direto exige valor", () => {
    expect(costStepSchema.safeParse(cost).success).toBe(false);
    expect(costStepSchema.safeParse({ ...cost, hourlyCost: 4.5 }).success).toBe(true);
  });
  it("cálculo exige preço e vida útil", () => {
    expect(costStepSchema.safeParse({ ...cost, mode: "calcular" }).success).toBe(false);
    expect(costStepSchema.safeParse({ ...cost, mode: "calcular", purchasePrice: 1500, lifespanHours: 1000 }).success).toBe(true);
  });
  it("filamento exige tipo válido e preço positivo", () => {
    expect(filamentStepSchema.safeParse({ material: "PLA", pricePerKg: 120 }).success).toBe(true);
    expect(filamentStepSchema.safeParse({ material: "PLA", pricePerKg: 0 }).success).toBe(false);
    expect(filamentStepSchema.safeParse({ material: "Madeira", pricePerKg: 100 }).success).toBe(false);
  });
  it("impressora e margem", () => {
    expect(printerStepSchema.safeParse({ brand: "  ", model: "A1" }).success).toBe(false);
    expect(printerStepSchema.safeParse({ brand: "Bambu Lab", model: "" }).success).toBe(false);
    expect(printerStepSchema.safeParse({ brand: "Bambu Lab", model: "A1 mini" }).success).toBe(true);
    expect(marginStepSchema.safeParse({ marginPercent: 100 }).success).toBe(false);
    expect(marginStepSchema.safeParse({ marginPercent: 30 }).success).toBe(true);
  });
});
