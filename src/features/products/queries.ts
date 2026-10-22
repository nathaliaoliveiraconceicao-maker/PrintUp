import type { SupabaseClient } from "@supabase/supabase-js";
import { pricingInputSchema } from "@/lib/pricing";
import type { FilamentRow } from "@/features/filaments/schema";
import type { PrinterRow } from "@/features/printers/schema";
import { settingsOrDefault, type SettingsRow } from "@/features/settings/schema";
import type { CatalogProduct } from "./catalog-schema";
import { staleness, type Staleness } from "./refresh";

export async function loadSettings(supabase: SupabaseClient): Promise<SettingsRow> {
  const { data } = await supabase.from("cost_settings").select("*").maybeSingle();
  return settingsOrDefault(data as Partial<SettingsRow> | null);
}

/**
 * Para cada produto vindo de um cálculo, compara o que está gravado com o que daria recalcular hoje.
 * Só LÊ: nada é alterado sem o usuário pedir.
 */
export async function loadStaleness(
  supabase: SupabaseClient,
  products: Pick<CatalogProduct, "id" | "pricing_id" | "production_cost" | "sale_price" | "printer_id" | "filament_id">[],
): Promise<Map<string, Staleness>> {
  const out = new Map<string, Staleness>();
  const withPricing = products.filter((p) => p.pricing_id);
  if (withPricing.length === 0) return out;

  const [pricings, printers, filaments, settings] = await Promise.all([
    supabase.from("pricings").select("id, input").in("id", withPricing.map((p) => p.pricing_id as string)),
    supabase.from("printers").select("*"),
    supabase.from("filaments").select("*"),
    loadSettings(supabase),
  ]);
  const inputById = new Map(((pricings.data ?? []) as { id: string; input: unknown }[]).map((r) => [r.id, r.input]));
  const printerById = new Map(((printers.data ?? []) as PrinterRow[]).map((r) => [r.id, r]));
  const filamentById = new Map(((filaments.data ?? []) as FilamentRow[]).map((r) => [r.id, r]));

  for (const p of withPricing) {
    const parsed = pricingInputSchema.safeParse(inputById.get(p.pricing_id as string));
    if (!parsed.success || p.production_cost === null || p.sale_price === null) continue;
    out.set(
      p.id,
      staleness(
        parsed.data,
        p.production_cost,
        p.sale_price,
        printerById.get(p.printer_id ?? "") ?? null,
        filamentById.get(p.filament_id ?? "") ?? null,
        settings,
      ),
    );
  }
  return out;
}
