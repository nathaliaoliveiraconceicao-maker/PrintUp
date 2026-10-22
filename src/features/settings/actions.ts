"use server";

import { revalidatePath } from "next/cache";
import { dbErrorMessage, zodToState, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { channelSchema, FIXED_ITEMS, multiplierToMarkup, settingsSchema } from "./schema";

export async function saveSettings(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = settingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodToState(parsed.error);
  const v = parsed.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada. Entre novamente." };

  const items = Object.fromEntries(FIXED_ITEMS.map(([k]) => [k, (v as unknown as Record<string, number>)[`item_${k}`]]).filter(([, n]) => (n as number) > 0));
  const monthlyFixed = Object.values(items).reduce((a, b) => (a as number) + (b as number), 0) as number;

  const { error } = await supabase.from("cost_settings").upsert({
    user_id: user.id,
    monthly_fixed_costs: Math.round(monthlyFixed * 100) / 100,
    fixed_items: items,
    expected_revenue: v.expectedRevenue,
    fixed_allocation: v.fixedAllocation,
    productive_hours_per_month: v.productiveHoursPerMonth,
    monthly_units: v.monthlyUnits,
    energy_price_per_kwh: v.energyPricePerKwh,
    labor_hourly_rate: v.laborHourlyRate,
    packaging_per_unit: v.packagingPerUnit,
    shipping_per_unit: v.shippingPerUnit,
    loss_percent: v.lossPercent,
    pricing_mode: v.pricingMode,
    margin_percent: v.marginPercent,
    markup_percent: multiplierToMarkup(v.markupMultiplier),
    tax_percent: v.taxPercent,
    sale_fee_percent: v.saleFeePercent,
    sale_fee_fixed: v.saleFeeFixed,
    price_rounding: v.roundToReal ? "real" : "none",
  });
  if (error) return { error: dbErrorMessage(error) };

  revalidatePath("/", "layout");
  return { ok: "Configurações salvas. Elas valem para todos os próximos cálculos." };
}

export type ChannelState = FormState & { id?: string };

/** Cria (id nulo) ou atualiza um canal de venda. O limite de 10 canais é imposto pelo banco. */
export async function saveChannel(id: string | null, _: ChannelState, formData: FormData): Promise<ChannelState> {
  const parsed = channelSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodToState(parsed.error);
  const v = parsed.data;
  const supabase = await createClient();
  const row = { name: v.name, fee_percent: v.feePercent, fee_fixed: v.feeFixed };
  const res = id ? await supabase.from("sales_channels").update(row).eq("id", id).select("id").maybeSingle() : await supabase.from("sales_channels").insert(row).select("id").maybeSingle();
  if (res.error) {
    if (res.error.code === "23505") return { error: "Já existe um canal com este nome." };
    if (res.error.code === "P0001" && res.error.message?.includes("Limite de canais")) return { error: "Você já tem 10 canais de venda (o máximo)." };
    return { error: dbErrorMessage(res.error) };
  }
  revalidatePath("/configuracoes");
  revalidatePath("/calculadora");
  return { ok: id ? "Canal atualizado." : "Canal adicionado.", id: (res.data?.id as string | undefined) ?? id ?? undefined };
}

export async function deleteChannel(id: string): Promise<FormState> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "Canal inválido." };
  const supabase = await createClient();
  const { error } = await supabase.from("sales_channels").delete().eq("id", id);
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath("/configuracoes");
  revalidatePath("/calculadora");
  return { ok: "Canal removido." };
}
