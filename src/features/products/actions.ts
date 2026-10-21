"use server";

import { revalidatePath } from "next/cache";
import { dbErrorMessage } from "@/lib/forms";
import { calculatePricing, PRICING_ENGINE_VERSION } from "@/lib/pricing";
import { createClient } from "@/lib/supabase/server";
import { savePricingSchema, type SavePricingState } from "./schema";

/**
 * Salva um retrato da precificação. O resultado é RECALCULADO aqui no servidor a partir da entrada:
 * o que o navegador mostrou nunca é confiado. RLS garante que produto/impressora/filamento são do usuário.
 */
export async function savePricing(payload: unknown): Promise<SavePricingState> {
  const parsed = savePricingSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const { input, productId, newProductName, printerId, filamentId } = parsed.data;
  const result = calculatePricing(input);

  const supabase = await createClient();

  // Nomes lidos do banco (e não do cliente) para o histórico ficar legível mesmo se o item for excluído depois.
  const [printer, filament] = await Promise.all([
    printerId ? supabase.from("printers").select("name").eq("id", printerId).maybeSingle() : null,
    filamentId ? supabase.from("filaments").select("name").eq("id", filamentId).maybeSingle() : null,
  ]);

  let targetId = productId;
  let createdProduct = false;
  if (!targetId) {
    const { data, error } = await supabase.from("products").insert({ name: newProductName }).select("id").single();
    if (error || !data) return { error: dbErrorMessage(error ?? {}) };
    targetId = data.id as string;
    createdProduct = true;
  }

  const { error } = await supabase.from("pricings").insert({
    product_id: targetId,
    printer_id: printer?.data ? printerId : null,
    filament_id: filament?.data ? filamentId : null,
    printer_name: printer?.data?.name ?? null,
    filament_name: filament?.data?.name ?? null,
    quantity: input.quantity,
    pricing_mode: input.pricing.mode,
    unit_cost: result.unitCost,
    unit_price: result.suggestedUnitPrice,
    unit_profit: result.unitProfit,
    margin_percent: Math.round(result.marginPercent * 100) / 100,
    markup_percent: Math.round(result.markupPercent * 100) / 100,
    input,
    result,
    engine_version: PRICING_ENGINE_VERSION,
  });

  if (error) {
    // Não deixa produto órfão se a precificação falhou logo após criá-lo.
    if (createdProduct) await supabase.from("products").delete().eq("id", targetId);
    return { error: dbErrorMessage(error) };
  }

  revalidatePath("/calculadora");
  revalidatePath("/produtos");
  revalidatePath("/");
  return { ok: true, productId: targetId };
}

export async function deleteProduct(id: string) {
  const supabase = await createClient();
  await supabase.from("products").delete().eq("id", id);
  revalidatePath("/produtos");
  revalidatePath("/");
}

export async function deletePricing(id: string, productId: string) {
  const supabase = await createClient();
  await supabase.from("pricings").delete().eq("id", id);
  revalidatePath(`/produtos/${productId}`);
  revalidatePath("/produtos");
  revalidatePath("/");
}
