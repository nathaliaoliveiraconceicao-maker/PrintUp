import { SettingsTabs } from "@/components/settings-tabs";
import { PageHeader } from "@/components/ui/card";
import { ChannelsEditor } from "@/features/settings/channels-editor";
import { settingsOrDefault, type ChannelRow, type SettingsRow } from "@/features/settings/schema";
import { SettingsForm } from "@/features/settings/settings-form";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Configurações de custo" };

export default async function SettingsPage() {
  const supabase = await createClient();
  const [{ data }, channels] = await Promise.all([
    supabase.from("cost_settings").select("*").maybeSingle(),
    supabase.from("sales_channels").select("id, name, fee_percent, fee_fixed, sort_order").order("sort_order").order("created_at"),
  ]);
  return (
    <>
      <PageHeader title="Configurações de custo" description="Preencha uma única vez: o PrintUp usa estes valores em todos os cálculos." />
      <SettingsTabs current="/configuracoes" />
      <div className="space-y-6">
        <SettingsForm settings={settingsOrDefault(data as Partial<SettingsRow> | null)} />
        <ChannelsEditor channels={(channels.data ?? []) as ChannelRow[]} />
      </div>
    </>
  );
}
