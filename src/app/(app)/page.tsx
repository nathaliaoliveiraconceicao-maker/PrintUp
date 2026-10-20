import Link from "next/link";
import { ArrowRight, Calculator, Layers, Printer, Settings } from "lucide-react";
import { Card, PageHeader } from "@/components/ui/card";
import { DEFAULT_SETTINGS, type SettingsRow } from "@/features/settings/schema";
import { createClient } from "@/lib/supabase/server";
import { daysUntil, formatBRL, formatPercent } from "@/lib/utils";

export const metadata = { title: "Início" };

type Entitlement = { plan_code: string; status: string; limits: Record<string, number | null>; active: boolean };

export default async function DashboardPage() {
  const supabase = await createClient();
  const [printers, filaments, settingsRes, ent, sub, profile] = await Promise.all([
    supabase.from("printers").select("id", { count: "exact", head: true }),
    supabase.from("filaments").select("id", { count: "exact", head: true }),
    supabase.from("cost_settings").select("*").maybeSingle(),
    supabase.rpc("current_entitlements"),
    supabase.from("subscriptions").select("status, trial_ends_at, plan:plans(name)").in("status", ["trialing", "active", "past_due"]).maybeSingle(),
    supabase.from("profiles").select("full_name").maybeSingle(),
  ]);

  const s = (settingsRes.data as SettingsRow | null) ?? DEFAULT_SETTINGS;
  const entitlement = (ent.data as Entitlement[] | null)?.[0];
  const trialEnds = sub.data?.status === "trialing" && sub.data.trial_ends_at ? new Date(sub.data.trial_ends_at) : null;
  const daysLeft = trialEnds ? daysUntil(trialEnds) : null;
  const fixedPerHour =
    s.fixed_allocation === "per_hour" && s.productive_hours_per_month > 0 ? s.monthly_fixed_costs / s.productive_hours_per_month : null;
  const firstName = profile.data?.full_name?.split(" ")[0];

  return (
    <>
      <PageHeader title={firstName ? `Olá, ${firstName}` : "Início"} description="Vamos precificar sua próxima peça?" />

      <Link
        href="/calculadora"
        className="group mb-6 flex items-center justify-between rounded-3xl bg-ink p-6 text-paper transition-colors hover:bg-accent-strong"
      >
        <div>
          <p className="text-sm opacity-70">Acesso rápido</p>
          <p className="mt-1 text-2xl font-semibold">Calcular preço de uma peça</p>
        </div>
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-white">
          <Calculator />
        </span>
      </Link>

      <section aria-label="Seus parâmetros de custo" className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Margem padrão" value={formatPercent(s.margin_percent)} />
        <Kpi label="Energia" value={`${formatBRL(s.energy_price_per_kwh)}/kWh`} />
        <Kpi label="Custo fixo / hora" value={fixedPerHour != null ? formatBRL(fixedPerHour) : "por peça"} />
        <Kpi label="Taxas + impostos" value={formatPercent(s.sale_fee_percent + s.tax_percent)} />
      </section>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Shortcut href="/impressoras" icon={<Printer size={20} />} title="Impressoras" detail={usage(printers.count, entitlement?.limits.max_printers)} />
        <Shortcut href="/filamentos" icon={<Layers size={20} />} title="Filamentos" detail={usage(filaments.count, entitlement?.limits.max_filaments)} />
        <Shortcut href="/configuracoes" icon={<Settings size={20} />} title="Custos e margens" detail="Ajustar padrões" />
      </div>

      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted">Seu plano</p>
          <p className="font-medium">
            {(sub.data?.plan as { name?: string } | null)?.name ?? "Sem assinatura ativa"}
            {daysLeft != null && <span className="ml-2 text-sm text-muted">· {daysLeft} dias de teste restantes</span>}
          </p>
        </div>
        {entitlement && !entitlement.active && (
          <p role="alert" className="text-sm text-danger">Assinatura inativa: novos cadastros estão bloqueados.</p>
        )}
      </Card>
      <p className="mt-4 text-xs text-muted">
        Indicadores de vendas e lucro aparecem aqui quando você começar a salvar produtos e orçamentos.
      </p>
    </>
  );
}

function usage(count: number | null, limit: number | null | undefined) {
  return `${count ?? 0}${limit == null ? "" : ` de ${limit}`} cadastrad${count === 1 ? "a" : "as"}`.replace("cadastradas", "cadastrados").replace("cadastrada", "cadastrado");
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="num mt-1 text-lg font-semibold">{value}</p>
    </Card>
  );
}

function Shortcut({ href, icon, title, detail }: { href: string; icon: React.ReactNode; title: string; detail: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 hover:border-accent">
      <span className="text-accent">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{title}</span>
        <span className="block truncate text-sm text-muted">{detail}</span>
      </span>
      <ArrowRight size={16} className="text-muted" />
    </Link>
  );
}
