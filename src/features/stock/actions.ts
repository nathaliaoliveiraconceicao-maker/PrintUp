"use server";

import { revalidatePath } from "next/cache";
import { dbErrorMessage } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { adjustSpoolSchema, createSpoolSchema, spoolMetaSchema, type StockActionState } from "./schema";

const refresh = () => {
  revalidatePath("/estoque");
  revalidatePath("/producao");
  revalidatePath("/");
};

export async function createSpool(payload: unknown): Promise<StockActionState> {
  const parsed = createSpoolSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const v = parsed.data;
  if (!v.filamentId && !v.material) return { error: "Escolha o filamento ou informe o tipo de material." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_spool", {
    p_filament: v.filamentId ?? null,
    p_manufacturer: v.manufacturer ?? null,
    p_material: v.material ?? null,
    p_color: v.color ?? null,
    p_initial_g: v.initialG,
    p_price_paid: v.pricePaid,
    p_purchased_at: v.purchasedAt ?? null,
    p_location: v.location ?? null,
    p_notes: v.notes ?? null,
    p_key: v.key,
  });
  if (error) return { error: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: "Bobina cadastrada." };
}

export async function adjustSpool(payload: unknown): Promise<StockActionState> {
  const parsed = adjustSpoolSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("adjust_spool", { p_spool: v.spoolId, p_new_remaining: v.newRemaining, p_note: v.note, p_key: v.key });
  if (error) return { error: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: "Saldo ajustado e registrado no histórico." };
}

/** Dados descritivos da bobina (o saldo só muda por movimentações). */
export async function updateSpoolMeta(payload: unknown): Promise<StockActionState> {
  const parsed = spoolMetaSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("filament_spools")
    .update({ manufacturer: v.manufacturer ?? null, color: v.color ?? null, location: v.location ?? null, status: v.status, notes: v.notes ?? null })
    .eq("id", v.spoolId);
  if (error) return { error: dbErrorMessage(error) };
  refresh();
  return { ok: true };
}

export async function setMinStock(filamentId: string, grams: number): Promise<StockActionState> {
  if (!Number.isInteger(grams) || grams < 0 || grams > 1_000_000) return { error: "Informe um valor válido." };
  const supabase = await createClient();
  const { error } = await supabase.from("filaments").update({ min_stock_g: grams }).eq("id", filamentId);
  if (error) return { error: dbErrorMessage(error) };
  refresh();
  return { ok: true };
}
