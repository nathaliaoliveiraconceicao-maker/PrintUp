import { z } from "zod";
import type { PricingInput, PricingResult } from "@/lib/pricing";
import { pricingInputSchema } from "@/lib/pricing";

export const savePricingSchema = z
  .object({
    productId: z.uuid().optional(),
    newProductName: z.string().trim().min(1, "Dê um nome ao produto.").max(120).optional(),
    printerId: z.uuid().nullish(),
    filamentId: z.uuid().nullish(),
    input: pricingInputSchema,
  })
  .refine((v) => Boolean(v.productId) !== Boolean(v.newProductName), {
    message: "Escolha um produto existente ou informe o nome de um novo.",
    path: ["productId"],
  });

export type SavePricingPayload = z.input<typeof savePricingSchema>;
export type SavePricingState = { ok?: true; productId?: string; error?: string };

export type ProductRow = { id: string; name: string; notes: string | null; created_at: string };

export type PricingRow = {
  id: string;
  product_id: string;
  printer_name: string | null;
  filament_name: string | null;
  quantity: number;
  pricing_mode: "margin" | "markup";
  unit_cost: number;
  unit_price: number;
  unit_profit: number;
  margin_percent: number;
  markup_percent: number;
  input: PricingInput;
  result: PricingResult;
  engine_version: number;
  created_at: string;
};
