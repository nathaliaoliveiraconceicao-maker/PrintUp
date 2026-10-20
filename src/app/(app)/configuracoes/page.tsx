import { PageHeader } from "@/components/ui/card";
import { DEFAULT_SETTINGS, type SettingsRow } from "@/features/settings/schema";
import { SettingsForm } from "@/features/settings/settings-form";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Configurações de custo" };

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("cost_settings").select("*").maybeSingle();
  return (
    <>
      <PageHeader title="Configurações de custo" description="Padrões usados em todos os cálculos." />
      <SettingsForm settings={(data as SettingsRow | null) ?? DEFAULT_SETTINGS} />
    </>
  );
}
