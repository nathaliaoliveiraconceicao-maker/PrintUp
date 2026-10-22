import { OnboardingWizard, type WizardInitial } from "@/features/onboarding/wizard";
import type { PrinterRow } from "@/features/printers/schema";
import type { FilamentRow } from "@/features/filaments/schema";
import { DEFAULT_SETTINGS, type SettingsRow } from "@/features/settings/schema";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Configuração inicial" };

export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ refazer?: string }> }) {
  const { refazer } = await searchParams;
  const supabase = await createClient();
  const [profile, printers, filaments, settings] = await Promise.all([
    supabase.from("profiles").select("business_name").maybeSingle(),
    supabase.from("printers").select("*").order("created_at").limit(1),
    supabase.from("filaments").select("*").order("created_at").limit(1),
    supabase.from("cost_settings").select("*").maybeSingle(),
  ]);
  const p = (printers.data?.[0] ?? null) as PrinterRow | null;
  const f = (filaments.data?.[0] ?? null) as FilamentRow | null;
  const s = (settings.data as SettingsRow | null) ?? DEFAULT_SETTINGS;
  const initial: WizardInitial = {
    businessName: (profile.data?.business_name as string | null) ?? "",
    printer: p ? { id: p.id, name: p.name, brand: p.brand ?? "", model: p.model ?? (p.brand ? "" : p.name), power: p.power_watts, hourlyCost: p.hourly_cost, purchasePrice: p.purchase_price, lifespanHours: p.lifespan_hours ?? 0 } : null,
    filament: f ? { id: f.id, material: f.material, color: f.color ?? "", pricePerKg: f.price_per_kg } : null,
    margin: s.margin_percent,
  };
  return <OnboardingWizard initial={initial} redo={refazer === "1"} />;
}
