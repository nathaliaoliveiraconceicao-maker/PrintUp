import Link from "next/link";
import { ArrowRight, Calculator, FileText, FileUp, Layers, Package, Printer, Settings } from "lucide-react";
import { Card, PageHeader } from "@/components/ui/card";
import { GettingStarted } from "@/features/onboarding/getting-started";
import type { PricingRow } from "@/features/products/schema";
import { DEFAULT_SETTINGS, type SettingsRow } from "@/features/settings/schema";
import { createClient } from "@/lib/supabase/server";
import { daysUntil, formatBRL, formatDateTime, formatPercent } from "@/lib/utils";

export const metadata = { title: "Início" };

type Entitlement = { plan_code: string; status: string; limits: Record<string, number | null>; active: boolean };
type Latest = Pick<PricingRow, "product_id" | "unit_price" | "unit_profit" | "margin_percent">;
type Recent = Pick<PricingRow, "id" | "product_id" | "unit_price" | "margin_percent" | "created_at">;

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export default async function DashboardPage() {
  const supabase = await createClient();
  const [printers, filaments, products, latestRes, recentRes, settingsRes, ent, sub, profile] = await Promise.all([
    supabase.from("printers").select("id", { count: "exact", head: true }),
    supabase.from("filaments").select("id", { count: "exact", head: true }),
    supabase.from("products").select("id, name"),
    supabase.from("latest_pricings").select("product_id, unit_price, unit_profit, margin_percent"),
    supabase.from("pricings").select("id, product_id, unit_price, margin_percent, created_at").order("created_at", { ascending: false }).limit(5),
    supabase.from("cost_settings").select("*").maybeSingle(),
    supabase.rpc("current_entitlements"),
    supabase.from("subscriptions").select("status, trial_ends_at, plan:plans(name)").in("status", ["trialing", "active", "past_due"]).maybeSingle(),
    supabase.from("profiles").select("full_name").maybeSingle(),
  ]);

  const s = (settingsRes.data as SettingsRow | null) ?? DEFAULT_SETTINGS;
  const latest = (latestRes.data ?? []) as Latest[];
  const recent = (recentRes.data ?? []) as Recent[];
  const names = new Map(((products.data ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));
  const belowTarget = latest.filter((l) => l.margin_percent < s.margin_percent - 1).length;

  const entitlement = (ent.data as Entitlement[] | null)?.[0];
  const trialEnds = sub.data?.status === "trialing" && sub.data.trial_ends_at ? new Date(sub.data.trial_ends_at) : null;
  const daysLeft = trialEnds ? daysUntil(trialEnds) : null;
  const firstName = profile.data?.full_name?.split(" ")[0];

  return (
    <>
      <PageHeader title={firstName ? `Olá, ${firstName}` : "Início"} description="Vamos precificar sua próxima peça?" />

      <GettingStarted
        printers={printers.count ?? 0}
        filaments={filaments.count ?? 0}
        hasSettings={Boolean(settingsRes.data)}
        pricings={latest.length}
      />

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

      {latest.length === 0 ? (
        <Card className="mb-6 text-sm text-muted">
          <p className="font-medium text-ink">Seus indicadores aparecem aqui.</p>
          <p className="mt-1">Calcule um preço e use <strong>Salvar precificação</strong> para ver preço médio, margem e lucro por unidade.</p>
        </Card>
      ) : (
        <section aria-label="Indicadores dos seus produtos" className="mb-6">
          <p className="mb-2 text-xs text-muted">Baseado no último preço salvo de cada produto</p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="Produtos precificados" value={String(latest.length)} />
            <Kpi label="Preço médio" value={formatBRL(avg(latest.map((l) => l.unit_price)))} />
            <Kpi label="Margem média" value={formatPercent(avg(latest.map((l) => l.margin_percent)))} />
            <Kpi label="Lucro médio / unid." value={formatBRL(avg(latest.map((l) => l.unit_profit)))} tone="ok" />
          </div>
          {belowTarget > 0 && (
            <p className="mt-3 rounded-xl bg-accent-soft px-3 py-2 text-sm text-warn">
              {belowTarget} produto{belowTarget > 1 ? "s estão" : " está"} abaixo da sua margem padrão de {formatPercent(s.margin_percent)}.{" "}
              <Link href="/produtos" className="font-medium underline">Ver produtos</Link>
            </p>
          )}
        </section>
      )}

      {recent.length > 0 && (
        <Card className="mb-6 p-0">
          <h2 className="px-4 pb-1 pt-4 text-sm font-semibold">Últimas precificações</h2>
          <ul className="divide-y divide-line">
            {recent.map((r) => (
              <li key={r.id}>
                <Link href={`/produtos/${r.product_id}`} className="flex items-baseline justify-between gap-3 px-4 py-3 text-sm hover:bg-paper">
                  <span className="min-w-0 truncate font-medium">{names.get(r.product_id) ?? "Produto"}</span>
                  <span className="num shrink-0">{formatBRL(r.unit_price)} <span className="text-muted">· {formatPercent(r.margin_percent)}</span></span>
                </Link>
                <p className="num -mt-2 px-4 pb-2 text-xs text-muted">{formatDateTime(r.created_at)}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Shortcut href="/importar" icon={<FileUp size={20} />} title="Importar modelo" detail="3MF, G-code ou manual" />
        <Shortcut href="/produtos" icon={<Package size={20} />} title="Produtos" detail={`${products.data?.length ?? 0} cadastrados`} />
        <Shortcut href="/orcamentos" icon={<FileText size={20} />} title="Orçamentos" detail="Crie e envie em PDF" />
        <Shortcut href="/impressoras" icon={<Printer size={20} />} title="Impressoras" detail={usage(printers.count, entitlement?.limits.max_printers)} />
        <Shortcut href="/filamentos" icon={<Layers size={20} />} title="Filamentos" detail={usage(filaments.count, entitlement?.limits.max_filaments)} />
        <Shortcut href="/configuracoes" icon={<Settings size={20} />} title="Custos e margens" detail={`Margem padrão ${formatPercent(s.margin_percent)}`} />
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
    </>
  );
}

function usage(count: number | null, limit: number | null | undefined) {
  return `${count ?? 0}${limit == null ? "" : ` de ${limit}`} cadastrado(s)`;
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "ok" }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className={`num mt-1 text-lg font-semibold ${tone === "ok" ? "text-ok" : ""}`}>{value}</p>
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
