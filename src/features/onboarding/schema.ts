import { z } from "zod";
import { MATERIALS } from "@/features/filaments/schema";

const money = (max: number) => z.number({ error: "Informe um número válido." }).min(0, "Não pode ser negativo.").max(max, "Valor alto demais.");

export const businessStepSchema = z.object({ businessName: z.string().trim().min(1, "Informe o nome do seu negócio.").max(120) });

export const printerStepSchema = z.object({
  printerId: z.uuid().nullish(),
  brand: z.string().trim().min(1, "Informe a marca da impressora.").max(40),
  model: z.string().trim().min(1, "Informe o nome ou modelo da impressora.").max(39),
});

export const costStepSchema = z
  .object({
    printerId: z.uuid({ error: "Cadastre a impressora antes." }),
    mode: z.enum(["direto", "calcular"]),
    hourlyCost: money(10_000),
    includesEnergy: z.boolean(),
    includesWear: z.boolean(),
    purchasePrice: money(1_000_000),
    lifespanHours: money(100_000),
    powerWatts: money(5_000),
  })
  .superRefine((v, ctx) => {
    if (v.mode === "direto" && !(v.hourlyCost > 0)) ctx.addIssue({ code: "custom", path: ["hourlyCost"], message: "Informe quanto custa uma hora de impressão." });
    if (v.mode === "calcular") {
      if (!(v.purchasePrice > 0)) ctx.addIssue({ code: "custom", path: ["purchasePrice"], message: "Informe o preço de compra da impressora." });
      if (!(v.lifespanHours > 0)) ctx.addIssue({ code: "custom", path: ["lifespanHours"], message: "Informe a vida útil estimada em horas." });
    }
  });

export const filamentStepSchema = z.object({
  filamentId: z.uuid().nullish(),
  material: z.enum(MATERIALS, { error: "Escolha o tipo de filamento." }),
  color: z.string().trim().max(40).optional(),
  pricePerKg: money(100_000).refine((n) => n > 0, "Informe o preço por kg."),
});

export const marginStepSchema = z.object({ marginPercent: money(99) });

export type OnboardingState = { ok?: true; error?: string; id?: string };
