"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dbErrorMessage, zodToState } from "@/lib/forms";
import { detectImageKind } from "@/lib/image-type";
import { calculatePricing, pricingInputSchema, PRICING_ENGINE_VERSION, round2 } from "@/lib/pricing";
import { createClient } from "@/lib/supabase/server";
import type { FilamentRow } from "@/features/filaments/schema";
import type { PrinterRow } from "@/features/printers/schema";
import { catalogCostsFromPricing, grossMarginPercent } from "./from-pricing";
import { IMAGE_BUCKET, MAX_IMAGE_BYTES, isValidProductPhotoPath } from "./image-paths";
import { CATALOG_COLUMNS, productFormSchema, type CatalogProduct, type ProductActionState } from "./catalog-schema";
import { loadSettings } from "./queries";
import { refreshInput } from "./refresh";

const MAX_BULK = 200;

function refresh(productId?: string) {
  revalidatePath("/produtos");
  if (productId) revalidatePath(`/produtos/${productId}`);
  revalidatePath("/orcamentos/novo");
  revalidatePath("/");
}

async function currentUserId(supabase: SupabaseClient): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/** Apaga a imagem do Storage só se nenhum produto nem item de orçamento ainda a usa. */
async function removeImageIfUnused(supabase: SupabaseClient, path: string | null) {
  if (!path) return;
  const [p, q] = await Promise.all([
    supabase.from("products").select("id", { count: "exact", head: true }).eq("photo_path", path),
    supabase.from("quote_items").select("id", { count: "exact", head: true }).eq("photo_path", path),
  ]);
  if ((p.count ?? 0) === 0 && (q.count ?? 0) === 0) await supabase.storage.from(IMAGE_BUCKET).remove([path]);
}

/** Cria ou edita a ficha do produto (formulário). Produtos vindos de um cálculo mantêm custo e vínculo com o cálculo. */
export async function saveProduct(id: string | null, _: ProductActionState, formData: FormData): Promise<ProductActionState> {
  const parsed = productFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const { error, fieldErrors } = zodToState(parsed.error);
    return { error, fieldErrors };
  }
  const v = parsed.data;

  const supabase = await createClient();
  const existing = id
    ? ((await supabase.from("products").select(CATALOG_COLUMNS).eq("id", id).maybeSingle()).data as CatalogProduct | null)
    : null;
  if (id && !existing) return { error: "Produto não encontrado." };

  const [printer, filament] = await Promise.all([
    v.printerId ? supabase.from("printers").select("id, name").eq("id", v.printerId).maybeSingle() : null,
    v.filamentId ? supabase.from("filaments").select("id, material, color").eq("id", v.filamentId).maybeSingle() : null,
  ]);
  const printerRow = printer?.data as Pick<PrinterRow, "id" | "name"> | null | undefined;
  const filamentRow = filament?.data as Pick<FilamentRow, "id" | "material" | "color"> | null | undefined;

  const fromCalc = Boolean(existing?.pricing_id);
  const material = fromCalc ? existing!.material_cost : v.materialCost;
  const machine = fromCalc ? existing!.machine_cost : v.machineCost;
  const other = fromCalc ? existing!.other_costs : v.otherCosts;
  const manualCosts = !fromCalc && (v.materialCost > 0 || v.machineCost > 0 || v.otherCosts > 0);
  const productionCost = fromCalc ? existing!.production_cost : manualCosts ? round2(v.materialCost + v.machineCost + v.otherCosts) : null;
  const salePrice = v.salePrice ?? null;

  // Margem: preço digitado à mão => margem BRUTA (sem taxas/impostos). Preço inalterado de um cálculo mantém a margem líquida original.
  let marginPercent = existing?.margin_percent ?? null;
  let marginBasis = existing?.margin_basis ?? null;
  const priceChanged = existing ? salePrice !== existing.sale_price : true;
  if (priceChanged || !existing) {
    marginPercent = productionCost !== null && salePrice !== null ? grossMarginPercent(productionCost, salePrice) : null;
    marginBasis = marginPercent !== null ? "bruta" : null;
  }

  const minutes = round2(v.printHours * 60 + v.printMinutes);
  const row = {
    name: v.name,
    category: v.category ?? null,
    description: v.description ?? null,
    printer_id: printerRow?.id ?? null,
    printer_name: printerRow?.name ?? (v.printerId ? null : (existing?.printer_name ?? null)),
    filament_id: filamentRow?.id ?? null,
    filament_type: v.filamentType ?? filamentRow?.material ?? null,
    filament_color: v.filamentColor ?? filamentRow?.color ?? null,
    weight_g: v.weightG && v.weightG > 0 ? v.weightG : null,
    print_minutes: minutes > 0 ? minutes : null,
    material_cost: material,
    machine_cost: machine,
    other_costs: other,
    production_cost: productionCost,
    margin_percent: marginPercent,
    margin_basis: marginBasis,
    sale_price: salePrice,
    stock_qty: Math.floor(v.stockQty),
    source_url: v.sourceUrl ?? null,
    license_info: v.licenseInfo ?? null,
  };

  const { data, error } = id
    ? await supabase.from("products").update(row).eq("id", id).select("id").single()
    : await supabase.from("products").insert(row).select("id").single();
  if (error || !data) return { error: dbErrorMessage(error ?? {}) };

  refresh(data.id as string);
  redirect(`/produtos/${data.id}`);
}

export async function archiveProduct(id: string, archived: boolean): Promise<ProductActionState> {
  const supabase = await createClient();
  const { error } = await supabase.from("products").update({ archived_at: archived ? new Date().toISOString() : null }).eq("id", id);
  if (error) return { error: dbErrorMessage(error) };
  refresh(id);
  return { ok: true };
}

export async function setStock(id: string, qty: number): Promise<ProductActionState> {
  if (!Number.isInteger(qty) || qty < 0 || qty > 1_000_000) return { error: "Informe uma quantidade válida." };
  const supabase = await createClient();
  const { error } = await supabase.from("products").update({ stock_qty: qty }).eq("id", id);
  if (error) return { error: dbErrorMessage(error) };
  refresh(id);
  return { ok: true };
}

/** Duplica o produto (e seu último cálculo, para a cópia também poder ser recalculada). Estoque da cópia começa em 0. */
export async function duplicateProduct(id: string): Promise<ProductActionState> {
  const supabase = await createClient();
  const userId = await currentUserId(supabase);
  if (!userId) return { error: "Sessão expirada. Entre novamente." };
  const { data: src } = await supabase.from("products").select(CATALOG_COLUMNS).eq("id", id).maybeSingle();
  if (!src) return { error: "Produto não encontrado." };
  const p = src as CatalogProduct;

  const { id: _id, created_at: _c, updated_at: _u, archived_at: _a, pricing_id: _pr, photo_path: _ph, ...copy } = p;
  void [_id, _c, _u, _a, _pr, _ph];
  const name = `${p.name} (cópia)`.slice(0, 120);
  const { data: created, error } = await supabase.from("products").insert({ ...copy, name, stock_qty: 0 }).select("id").single();
  if (error || !created) return { error: dbErrorMessage(error ?? {}) };
  const newId = created.id as string;

  if (p.pricing_id) {
    const { data: pr } = await supabase.from("pricings").select("*").eq("id", p.pricing_id).maybeSingle();
    if (pr) {
      const { id: _pid, created_at: _pc, product_id: _pp, user_id: _pu, ...rest } = pr as Record<string, unknown>;
      void [_pid, _pc, _pp, _pu];
      const { data: np } = await supabase.from("pricings").insert({ ...rest, product_id: newId }).select("id").single();
      if (np) await supabase.from("products").update({ pricing_id: np.id }).eq("id", newId);
    }
  }
  if (p.photo_path) {
    const ext = p.photo_path.endsWith(".png") ? "png" : "jpg";
    const target = `${userId}/produtos/${crypto.randomUUID()}.${ext}`;
    const { error: copyErr } = await supabase.storage.from(IMAGE_BUCKET).copy(p.photo_path, target);
    if (!copyErr) await supabase.from("products").update({ photo_path: target }).eq("id", newId);
  }
  refresh(newId);
  return { ok: true, productId: newId };
}

export async function deleteCatalogProduct(id: string): Promise<ProductActionState> {
  const supabase = await createClient();
  const { data } = await supabase.from("products").select("photo_path").eq("id", id).maybeSingle();
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) return { error: dbErrorMessage(error) };
  await removeImageIfUnused(supabase, (data?.photo_path as string | null) ?? null);
  refresh(id);
  return { ok: true };
}

/**
 * Registra a foto já enviada pelo navegador ao Storage. O servidor confere: caminho na pasta do usuário,
 * tamanho e TIPO REAL pelos primeiros bytes (a extensão não vale). Reprovou => apaga o arquivo.
 */
export async function setProductPhoto(productId: string, path: string | null): Promise<ProductActionState> {
  const supabase = await createClient();
  const userId = await currentUserId(supabase);
  if (!userId) return { error: "Sessão expirada. Entre novamente." };
  const { data: prev } = await supabase.from("products").select("photo_path").eq("id", productId).maybeSingle();
  if (!prev) return { error: "Produto não encontrado." };

  if (path !== null) {
    if (!isValidProductPhotoPath(userId, path)) return { error: "Caminho de imagem inválido." };
    const { data: blob } = await supabase.storage.from(IMAGE_BUCKET).download(path);
    const bytes = blob ? new Uint8Array(await blob.arrayBuffer()) : null;
    const kind = bytes ? detectImageKind(bytes) : null;
    if (!bytes || bytes.length > MAX_IMAGE_BYTES || (kind !== "png" && kind !== "jpeg")) {
      await supabase.storage.from(IMAGE_BUCKET).remove([path]);
      return { error: "A imagem não foi aceita. Use uma foto JPG ou PNG de até 2 MB." };
    }
  }
  const { error } = await supabase.from("products").update({ photo_path: path }).eq("id", productId);
  if (error) {
    if (path) await supabase.storage.from(IMAGE_BUCKET).remove([path]);
    return { error: dbErrorMessage(error) };
  }
  if (prev.photo_path && prev.photo_path !== path) await removeImageIfUnused(supabase, prev.photo_path as string);
  refresh(productId);
  return { ok: true };
}

/**
 * Recalcula produtos com os custos ATUAIS (filamento, impressora, energia, custos fixos). Só acontece quando o
 * usuário pede. Cada recálculo grava uma NOVA precificação (o histórico anterior permanece) e atualiza o produto.
 */
export async function recalculateProducts(ids: string[]): Promise<ProductActionState> {
  const unique = [...new Set(ids)].slice(0, MAX_BULK);
  if (unique.length === 0) return { error: "Nenhum produto selecionado." };
  const supabase = await createClient();
  const settings = await loadSettings(supabase);
  const { data: products } = await supabase.from("products").select("id, pricing_id").in("id", unique);
  const withPricing = ((products ?? []) as { id: string; pricing_id: string | null }[]).filter((p) => p.pricing_id);
  if (withPricing.length === 0) return { error: "Esses produtos não têm um cálculo para refazer." };

  const { data: pricings } = await supabase.from("pricings").select("*").in("id", withPricing.map((p) => p.pricing_id as string));
  const [printers, filaments] = await Promise.all([supabase.from("printers").select("*"), supabase.from("filaments").select("*")]);
  const printerById = new Map(((printers.data ?? []) as PrinterRow[]).map((r) => [r.id, r]));
  const filamentById = new Map(((filaments.data ?? []) as FilamentRow[]).map((r) => [r.id, r]));
  const pricingById = new Map(((pricings ?? []) as Record<string, unknown>[]).map((r) => [r.id as string, r]));

  let done = 0;
  for (const p of withPricing) {
    const old = pricingById.get(p.pricing_id as string);
    if (!old) continue;
    const parsed = pricingInputSchema.safeParse(old.input);
    if (!parsed.success) continue;
    const printer = printerById.get(old.printer_id as string) ?? null;
    const filament = filamentById.get(old.filament_id as string) ?? null;
    const input = refreshInput(parsed.data, printer, filament, settings);
    const check = pricingInputSchema.safeParse(input);
    if (!check.success) continue;
    const result = calculatePricing(check.data);

    const { data: created, error } = await supabase
      .from("pricings")
      .insert({
        product_id: p.id,
        printer_id: old.printer_id,
        filament_id: old.filament_id,
        printer_name: printer?.name ?? old.printer_name,
        filament_name: filament?.name ?? old.filament_name,
        quantity: check.data.quantity,
        pricing_mode: check.data.pricing.mode,
        unit_cost: result.unitCost,
        unit_price: result.suggestedUnitPrice,
        unit_profit: result.unitProfit,
        margin_percent: round2(result.marginPercent),
        markup_percent: round2(result.markupPercent),
        input: check.data,
        result,
        print_profile_id: old.print_profile_id ?? null,
        import_info: old.import_info ?? null,
        engine_version: PRICING_ENGINE_VERSION,
      })
      .select("id")
      .single();
    if (error || !created) continue;
    const { error: upErr } = await supabase
      .from("products")
      .update({ ...catalogCostsFromPricing(check.data, result), pricing_id: created.id })
      .eq("id", p.id);
    if (!upErr) done++;
  }
  refresh();
  if (done === 0) return { error: "Não foi possível recalcular. Tente novamente." };
  return { ok: true, message: done === 1 ? "1 produto recalculado." : `${done} produtos recalculados.` };
}
