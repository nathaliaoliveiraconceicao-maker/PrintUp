"use server";

import { revalidatePath } from "next/cache";
import { dbErrorMessage } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_SETTINGS, type SettingsRow } from "@/features/settings/schema";
import { wearPerHour } from "./hourly";
import { printerDisplayName } from "@/features/printers/schema";
import { businessStepSchema, costStepSchema, filamentStepSchema, marginStepSchema, printerStepSchema, type OnboardingState } from "./schema";

async function session() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

const refresh = () => {
  revalidatePath("/", "layout");
};

/** Passo 1: nome do negócio (perfil + identidade dos orçamentos). */
export async function saveBusinessStep(payload: unknown): Promise<OnboardingState> {
  const parsed = businessStepSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const { supabase, user } = await session();
  if (!user) return { error: "Sessão expirada. Entre novamente." };
  const [a, b] = await Promise.all([
    supabase.from("profiles").update({ business_name: parsed.data.businessName }).eq("id", user.id),
    supabase.from("business_profiles").upsert({ user_id: user.id, business_name: parsed.data.businessName }),
  ]);
  if (a.error || b.error) return { error: dbErrorMessage(a.error ?? b.error ?? {}) };
  refresh();
  return { ok: true };
}

/** Passo 2: impressora. Com `printerId`, atualiza a existente (não duplica). */
export async function savePrinterStep(payload: unknown): Promise<OnboardingState> {
  const parsed = printerStepSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const { brand, model, printerId } = parsed.data;
  const { supabase, user } = await session();
  if (!user) return { error: "Sessão expirada. Entre novamente." };
  const row = { name: printerDisplayName(brand, model), brand, model };
  if (printerId) {
    const { error } = await supabase.from("printers").update(row).eq("id", printerId);
    if (error) return { error: dbErrorMessage(error) };
    refresh();
    return { ok: true, id: printerId };
  }
  const { data, error } = await supabase.from("printers").insert(row).select("id").single();
  if (error || !data) return { error: dbErrorMessage(error ?? {}) };
  refresh();
  return { ok: true, id: data.id as string };
}

/** Passo 3: custo da hora — informado direto ou calculado (desgaste = preço ÷ vida útil). */
export async function saveCostStep(payload: unknown): Promise<OnboardingState> {
  const parsed = costStepSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const v = parsed.data;
  const { supabase } = await session();
  const row =
    v.mode === "direto"
      ? {
          hourly_cost: v.hourlyCost,
          hourly_includes_energy: v.includesEnergy,
          hourly_includes_wear: v.includesWear,
          power_watts: v.powerWatts,
        }
      : {
          hourly_cost: 0,
          hourly_includes_energy: false,
          hourly_includes_wear: false,
          power_watts: v.powerWatts,
          purchase_price: v.purchasePrice,
          lifespan_hours: Math.round(v.lifespanHours),
          wear_per_hour: wearPerHour(v.purchasePrice, v.lifespanHours),
        };
  const { error } = await supabase.from("printers").update(row).eq("id", v.printerId);
  if (error) return { error: dbErrorMessage(error) };
  refresh();
  return { ok: true, id: v.printerId };
}

/** Passo 4: filamento (tipo, cor e preço por kg). O nome é montado a partir de tipo + cor. */
export async function saveFilamentStep(payload: unknown): Promise<OnboardingState> {
  const parsed = filamentStepSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const { material, color, pricePerKg, filamentId } = parsed.data;
  const { supabase, user } = await session();
  if (!user) return { error: "Sessão expirada. Entre novamente." };
  const row = { name: [material, color].filter(Boolean).join(" ").slice(0, 80), material, color: color || null, price_per_kg: pricePerKg };
  if (filamentId) {
    const { error } = await supabase.from("filaments").update(row).eq("id", filamentId);
    if (error) return { error: dbErrorMessage(error) };
    refresh();
    return { ok: true, id: filamentId };
  }
  const { data, error } = await supabase.from("filaments").insert({ ...row, spool_weight_g: 1000 }).select("id").single();
  if (error || !data) return { error: dbErrorMessage(error ?? {}) };
  refresh();
  return { ok: true, id: data.id as string };
}

/** Passo 5: margem padrão. Respeita a regra taxas + impostos + margem < 100%. */
export async function saveMarginStep(payload: unknown): Promise<OnboardingState> {
  const parsed = marginStepSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const { supabase, user } = await session();
  if (!user) return { error: "Sessão expirada. Entre novamente." };
  const { data } = await supabase.from("cost_settings").select("*").maybeSingle();
  const cur = (data as SettingsRow | null) ?? DEFAULT_SETTINGS;
  if (cur.sale_fee_percent + cur.tax_percent + parsed.data.marginPercent >= 100) {
    return { error: "Taxas + impostos + margem devem somar menos de 100%. Reduza a margem ou ajuste as taxas em Configurações." };
  }
  const { error } = await supabase.from("cost_settings").upsert({ user_id: user.id, margin_percent: parsed.data.marginPercent });
  if (error) return { error: dbErrorMessage(error) };
  refresh();
  return { ok: true };
}

/** Conclui (ou pula) o assistente: ele não volta a aparecer sozinho. */
export async function finishOnboarding(): Promise<OnboardingState> {
  const { supabase, user } = await session();
  if (!user) return { error: "Sessão expirada. Entre novamente." };
  const { error } = await supabase.from("profiles").update({ onboarding_done_at: new Date().toISOString() }).eq("id", user.id);
  if (error) return { error: dbErrorMessage(error) };
  refresh();
  return { ok: true };
}
