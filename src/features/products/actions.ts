"use server";

import { revalidatePath } from "next/cache";
import { dbErrorMessage } from "@/lib/forms";
import { calculatePricing, PRICING_ENGINE_VERSION } from "@/lib/pricing";
import { createClient } from "@/lib/supabase/server";
import { comparePrinters } from "@/features/imports/printer-match";
import { catalogCostsFromPricing } from "./from-pricing";
import { savePricingSchema, type ImportInfo, type SavePricingState } from "./schema";

const close = (a: number | null, b: number) => a !== null && Math.abs(a - b) < 0.005;

/**
 * Salva um retrato da precificação. O resultado é RECALCULADO aqui no servidor a partir da entrada:
 * o que o navegador mostrou nunca é confiado. RLS garante que produto/impressora/filamento são do usuário.
 */
export async function savePricing(payload: unknown): Promise<SavePricingState> {
  const parsed = savePricingSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const { input, productId, newProductName, category, printerId, filamentId, profileId } = parsed.data;
  const result = calculatePricing(input);

  const supabase = await createClient();

  // Nomes lidos do banco (e não do cliente) para o histórico ficar legível mesmo se o item for excluído depois.
  const [printer, filament] = await Promise.all([
    printerId ? supabase.from("printers").select("name").eq("id", printerId).maybeSingle() : null,
    filamentId ? supabase.from("filaments").select("name, material, color").eq("id", filamentId).maybeSingle() : null,
  ]);

  // Perfil de origem (RLS garante que é do usuário). Origens e diferenças são calculadas AQUI, a partir do gravado.
  let importInfo: ImportInfo | null = null;
  let modelId: string | null = null;
  if (profileId) {
    const { data: profile } = await supabase
      .from("print_profiles")
      .select("id, name, model_id, slicer_printer_name, weight_g, print_minutes, weight_origin, time_origin, edited_fields")
      .eq("id", profileId)
      .maybeSingle();
    if (!profile) return { error: "O perfil de impressão não foi encontrado." };
    const { data: model } = await supabase.from("imported_models").select("id, title").eq("id", profile.model_id).maybeSingle();
    const { data: chosen } = printerId ? await supabase.from("printers").select("name, brand, model").eq("id", printerId).maybeSingle() : { data: null };
    modelId = (model?.id as string | undefined) ?? null;
    importInfo = {
      profileName: profile.name as string,
      modelId,
      modelTitle: (model?.title as string | undefined) ?? null,
      slicerPrinterName: (profile.slicer_printer_name as string | null) ?? null,
      weightOrigin: profile.weight_origin as ImportInfo["weightOrigin"],
      timeOrigin: profile.time_origin as ImportInfo["timeOrigin"],
      // "Editado" = diferente do que o arquivo trouxe: corrigido na ficha de importação OU alterado na calculadora.
      weightEdited:
        (profile.weight_origin === "manual" && ((profile.edited_fields as string[] | null) ?? []).includes("weight")) ||
        (profile.weight_g !== null && !close(profile.weight_g as number, input.filamentGramsPerUnit)),
      timeEdited:
        (profile.time_origin === "manual" && ((profile.edited_fields as string[] | null) ?? []).includes("time")) ||
        (profile.print_minutes !== null && !close(profile.print_minutes as number, input.printMinutesPerUnit)),
      printerMatch: comparePrinters(profile.slicer_printer_name as string | null, chosen as { name: string; brand: string | null; model: string | null } | null),
    };
  }

  let targetId = productId;
  let createdProduct = false;
  if (!targetId) {
    const { data, error } = await supabase.from("products").insert({ name: newProductName, model_id: modelId, category: category || null }).select("id").single();
    if (error || !data) return { error: dbErrorMessage(error ?? {}) };
    targetId = data.id as string;
    createdProduct = true;
  }

  const { data: savedPricing, error } = await supabase.from("pricings").insert({
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
    print_profile_id: profileId ?? null,
    import_info: importInfo,
    engine_version: PRICING_ENGINE_VERSION,
  }).select("id").single();

  if (error || !savedPricing) {
    // Não deixa produto órfão se a precificação falhou logo após criá-lo.
    if (createdProduct) await supabase.from("products").delete().eq("id", targetId);
    return { error: dbErrorMessage(error ?? {}) };
  }

  // O produto passa a refletir este cálculo (custos, preço, margem, peso, tempo). Só acontece quando o usuário salva:
  // mexer depois em filamento/impressora NÃO altera o produto sozinho (há a opção "recalcular" na tela de produtos).
  const filamentRow = filament?.data as { name: string; material: string; color: string | null } | null | undefined;
  const { error: updErr } = await supabase
    .from("products")
    .update({
      ...catalogCostsFromPricing(input, result),
      pricing_id: savedPricing.id,
      printer_id: printer?.data ? printerId : null,
      printer_name: printer?.data?.name ?? null,
      filament_id: filamentRow ? filamentId : null,
      filament_type: filamentRow?.material ?? null,
      filament_color: filamentRow?.color ?? null,
    })
    .eq("id", targetId);
  if (updErr) return { error: dbErrorMessage(updErr) };

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
