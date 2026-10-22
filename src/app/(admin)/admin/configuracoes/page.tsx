import { PageHeader } from "@/components/ui/card";
import { SettingsForm } from "@/features/admin/forms";
import { Card } from "@/components/ui/card";
import { diagnoseBilling } from "@/features/admin/diagnostics";
import { mercadoPagoIsTestAccount } from "@/lib/billing/mercadopago";
import { requireAdminPage } from "@/features/admin/guard";
import { Badge } from "@/features/admin/ui";

export const metadata = { title: "Configurações · Administração" };

export default async function PlatformSettingsPage() {
  const { supabase } = await requireAdminPage();
  const { data } = await supabase.from("platform_settings").select("key, value");
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN ?? "";
  const accountIsTest = token.startsWith("APP_USR-") ? await mercadoPagoIsTestAccount(token) : null;
  const diag = diagnoseBilling(process.env, accountIsTest);
  const get = (k: string) => (data ?? []).find((r) => r.key === k)?.value as unknown;
  return (
    <>
      <PageHeader title="Configurações da plataforma" description="Valores validados no servidor e no banco. Cada alteração fica na auditoria." />
      <SettingsForm values={{
        billing_grace_days: Number(get("billing_grace_days") ?? 7), trial_enabled: get("trial_enabled") !== false,
        support_email: String(get("support_email") ?? ""), terms_url: String(get("terms_url") ?? ""), privacy_url: String(get("privacy_url") ?? ""),
      }} />
      <h2 className="mb-2 mt-10 text-lg font-semibold">Pagamentos: diagnóstico</h2>
      <Card className="space-y-3" data-testid="diagnostico-pagamentos">
        <p className="text-sm"><Badge tone={diag.enabled ? "ok" : "danger"}>{diag.enabled ? "Habilitado" : "Desligado"}</Badge> <span className="ml-2">{diag.summary}</span></p>
        <ul className="divide-y divide-line text-sm">
          {diag.items.map((i) => (
            <li key={i.name} className="flex flex-wrap items-start justify-between gap-2 py-2">
              <code className="text-xs">{i.name}</code>
              <span className={i.ok ? "text-ok" : "text-danger"}>{i.ok ? "✓" : "✗"} {i.detail}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted">Só mostra se cada variável existe e se o formato está certo. Nenhum valor secreto é exibido. Depois de mudar variáveis na Vercel, é preciso refazer o deploy.</p>
      </Card>
    </>
  );
}
