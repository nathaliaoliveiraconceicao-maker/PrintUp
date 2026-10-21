import { z } from "zod";
import { decimal, optionalText } from "@/lib/forms";

export const MATERIALS = ["PLA", "PETG", "ABS", "ASA", "TPU", "Nylon", "PC", "Outro"] as const;

export const filamentSchema = z.object({
  name: z.string().trim().min(1, "Dê um nome ao filamento.").max(80),
  brand: optionalText(60),
  material: z.enum(MATERIALS, { error: "Escolha o material." }),
  color: optionalText(40),
  pricePerKg: decimal({ max: 100_000 }),
  spoolWeightG: decimal({ min: 1, max: 20_000, empty: 1000 }),
  notes: optionalText(500),
});

export type FilamentRow = {
  id: string;
  name: string;
  brand: string | null;
  material: string;
  color: string | null;
  price_per_kg: number;
  spool_weight_g: number;
  min_stock_g?: number;
  notes: string | null;
};

export const toFilamentDb = (v: z.infer<typeof filamentSchema>) => ({
  name: v.name,
  brand: v.brand ?? null,
  material: v.material,
  color: v.color ?? null,
  price_per_kg: v.pricePerKg,
  spool_weight_g: Math.round(v.spoolWeightG),
  notes: v.notes ?? null,
});
