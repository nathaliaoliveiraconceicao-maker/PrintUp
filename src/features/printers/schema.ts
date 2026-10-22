import { z } from "zod";
import { checkbox, decimal, optionalText } from "@/lib/forms";

/** Nome que aparece nas listas: marca + nome/modelo (ex.: "Bambu Lab A1 mini"). */
export function printerDisplayName(brand: string | null | undefined, model: string | null | undefined): string {
  return [brand, model].map((x) => (x ?? "").trim()).filter(Boolean).join(" ").slice(0, 80);
}

export const printerSchema = z.object({
  brand: z.string().trim().min(1, "Informe a marca da impressora.").max(40),
  model: z.string().trim().min(1, "Informe o nome ou modelo da impressora.").max(39),
  purchasePrice: decimal({ max: 1_000_000 }),
  lifespanHours: decimal({ max: 100_000 }),
  powerWatts: decimal({ max: 5_000 }),
  hourlyCost: decimal({ max: 10_000 }),
  includesEnergy: checkbox,
  includesWear: checkbox,
  includesFixed: checkbox,
  wearPerHour: decimal({ max: 10_000 }),
  notes: optionalText(500),
});

export type PrinterRow = {
  id: string;
  name: string;
  brand: string | null;
  model: string | null;
  purchase_price: number;
  lifespan_hours: number | null;
  power_watts: number;
  hourly_cost: number;
  hourly_includes_energy: boolean;
  hourly_includes_wear: boolean;
  hourly_includes_fixed: boolean;
  wear_per_hour: number;
  notes: string | null;
};

export const toPrinterDb = (v: z.infer<typeof printerSchema>) => ({
  name: printerDisplayName(v.brand, v.model),
  brand: v.brand,
  model: v.model,
  purchase_price: v.purchasePrice,
  lifespan_hours: v.lifespanHours > 0 ? Math.round(v.lifespanHours) : null,
  power_watts: v.powerWatts,
  hourly_cost: v.hourlyCost,
  hourly_includes_energy: v.includesEnergy,
  hourly_includes_wear: v.includesWear,
  hourly_includes_fixed: v.includesFixed,
  wear_per_hour: v.wearPerHour,
  notes: v.notes ?? null,
});
