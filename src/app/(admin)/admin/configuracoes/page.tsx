import { PageHeader } from "@/components/ui/card";
import { SettingsForm } from "@/features/admin/forms";
import { requireAdminPage } from "@/features/admin/guard";

export const metadata = { title: "Configurações · Administração" };

export default async function PlatformSettingsPage() {
  const { supabase } = await requireAdminPage();
  const { data } = await supabase.from("platform_settings").select("key, value");
  const get = (k: string) => (data ?? []).find((r) => r.key === k)?.value as unknown;
  return (
    <>
      <PageHeader title="Configurações da plataforma" description="Valores validados no servidor e no banco. Cada alteração fica na auditoria." />
      <SettingsForm values={{
        billing_grace_days: Number(get("billing_grace_days") ?? 7), trial_enabled: get("trial_enabled") !== false,
        support_email: String(get("support_email") ?? ""), terms_url: String(get("terms_url") ?? ""), privacy_url: String(get("privacy_url") ?? ""),
      }} />
    </>
  );
}
