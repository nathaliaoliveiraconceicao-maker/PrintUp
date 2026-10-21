import { z } from "zod";
import { decimal, optionalText } from "@/lib/forms";

/** Campos da ficha de produto (formulário). Custos só entram quando o produto não veio de um cálculo. */
/** Campo numérico que pode nem existir no formulário (ex.: custos de um produto vindo de cálculo): ausente = 0. */
const dec = (max: number) => z.preprocess((v) => (v === undefined ? "" : v), decimal({ max }));

export const productFormSchema = z.object({
  name: z.string().trim().min(1, "Dê um nome ao produto.").max(120),
  category: optionalText(60),
  description: optionalText(2000),
  printerId: z.preprocess((v) => (v === "" ? undefined : v), z.uuid().optional()),
  filamentId: z.preprocess((v) => (v === "" ? undefined : v), z.uuid().optional()),
  filamentType: optionalText(60),
  filamentColor: optionalText(40),
  weightG: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), decimal({ max: 100_000 }).optional()),
  printHours: dec(10_000),
  printMinutes: dec(59),
  materialCost: dec(1_000_000),
  machineCost: dec(1_000_000),
  otherCosts: dec(1_000_000),
  salePrice: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), decimal({ max: 1_000_000 }).optional()),
  stockQty: dec(1_000_000),
  sourceUrl: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z
      .string()
      .trim()
      .max(500)
      .refine((s) => /^https?:\/\/\S+$/i.test(s), "Informe um link começando com http:// ou https://.")
      .optional(),
  ),
  licenseInfo: optionalText(500),
});

export type ProductFormValues = z.infer<typeof productFormSchema>;

/** Linha da tabela `products` como a interface usa. */
export interface CatalogProduct {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  photo_path: string | null;
  printer_id: string | null;
  printer_name: string | null;
  filament_id: string | null;
  filament_type: string | null;
  filament_color: string | null;
  weight_g: number | null;
  print_minutes: number | null;
  material_cost: number | null;
  machine_cost: number | null;
  other_costs: number | null;
  production_cost: number | null;
  margin_percent: number | null;
  margin_basis: "liquida" | "bruta" | null;
  sale_price: number | null;
  stock_qty: number;
  source_url: string | null;
  license_info: string | null;
  pricing_id: string | null;
  model_id: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export const CATALOG_COLUMNS =
  "id, name, category, description, photo_path, printer_id, printer_name, filament_id, filament_type, filament_color, weight_g, print_minutes, material_cost, machine_cost, other_costs, production_cost, margin_percent, margin_basis, sale_price, stock_qty, source_url, license_info, pricing_id, model_id, archived_at, created_at, updated_at";

export type ProductActionState = { ok?: true; error?: string; fieldErrors?: Record<string, string>; productId?: string; message?: string };
