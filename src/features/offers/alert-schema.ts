import { z } from "zod";
import { CATEGORY_SLUGS } from "./categories";
import type { AlertRule } from "./alerts";
import { parseDecimal } from "@/lib/utils";

const money = (label: string) => z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : typeof v === "string" ? parseDecimal(v) : v), z.number({ error: `${label}: informe um número válido.` }).positive(`${label}: informe um valor maior que zero.`).max(1_000_000).optional());

/** Formulário de alerta → regra validada (o banco confere de novo o formato básico). */
export const alertRuleSchema = z
  .object({
    kind: z.enum(["preco_abaixo", "desconto_acima", "voltou_estoque"], { error: "Escolha o tipo de alerta." }),
    category: z.preprocess((v) => (v === "" ? undefined : v), z.enum(CATEGORY_SLUGS as unknown as [string, ...string[]]).optional()),
    query: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().max(80).optional()),
    maxPrice: money("Preço máximo"),
    maxPricePerKg: money("Preço máximo por kg"),
    minDiscount: money("Desconto mínimo"),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "preco_abaixo" && v.maxPrice === undefined && v.maxPricePerKg === undefined) ctx.addIssue({ code: "custom", path: ["maxPrice"], message: "Informe o preço máximo (ou o preço máximo por kg)." });
    if (v.kind === "desconto_acima" && (v.minDiscount === undefined || v.minDiscount >= 100)) ctx.addIssue({ code: "custom", path: ["minDiscount"], message: "Informe o desconto mínimo, entre 1 e 99%." });
    if (v.kind === "voltou_estoque" && !v.query && !v.category) ctx.addIssue({ code: "custom", path: ["query"], message: "Diga qual produto: escreva palavras do nome ou escolha uma categoria." });
    if (v.maxPricePerKg !== undefined && v.category && !v.category.startsWith("filamento-")) ctx.addIssue({ code: "custom", path: ["maxPricePerKg"], message: "Preço por kg só vale para filamentos." });
  })
  .transform((v): { rule: AlertRule } => ({
    rule: {
      kind: v.kind,
      ...(v.category ? { category: v.category } : {}),
      ...(v.query ? { query: v.query } : {}),
      ...(v.maxPrice !== undefined ? { maxPriceCents: Math.round(v.maxPrice * 100) } : {}),
      ...(v.maxPricePerKg !== undefined ? { maxPricePerKgCents: Math.round(v.maxPricePerKg * 100) } : {}),
      ...(v.minDiscount !== undefined ? { minDiscountPct: v.minDiscount } : {}),
    },
  }));
