"use server";

import { revalidatePath } from "next/cache";
import { dbErrorMessage, zodToState, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { settingsSchema } from "./schema";

export async function saveSettings(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = settingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodToState(parsed.error);
  const v = parsed.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada. Entre novamente." };

  const { error } = await supabase.from("cost_settings").upsert({
    user_id: user.id,
    monthly_fixed_costs: v.monthlyFixedCosts,
    fixed_allocation: v.fixedAllocation,
    productive_hours_per_month: v.productiveHoursPerMonth,
    monthly_units: v.monthlyUnits,
    energy_price_per_kwh: v.energyPricePerKwh,
    labor_hourly_rate: v.laborHourlyRate,
    loss_percent: v.lossPercent,
    sale_fee_percent: v.saleFeePercent,
    sale_fee_fixed: v.saleFeeFixed,
    tax_percent: v.taxPercent,
    margin_percent: v.marginPercent,
  });
  if (error) return { error: dbErrorMessage(error) };

  revalidatePath("/", "layout");
  return { ok: "Configurações salvas." };
}
