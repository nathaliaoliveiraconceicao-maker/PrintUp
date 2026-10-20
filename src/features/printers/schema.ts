import { z } from "zod";
import { checkbox, decimal, optionalText } from "@/lib/forms";

export const printerSchema = z.object({
  name: z.string().trim().min(1, "Dê um nome à impressora.").max(80),
  brand: optionalText(60),
  model: optionalText(60),
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
  name: v.name,
  brand: v.brand ?? null,
  model: v.model ?? null,
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
