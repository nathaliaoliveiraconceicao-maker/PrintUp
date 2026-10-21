import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Calculator, FilePlus2, FileUp, Layers, PackagePlus, Printer, RefreshCw } from "lucide-react";
import { Card, PageHeader } from "@/components/ui/card";
import { quoteMetrics, type QuoteForMetrics } from "@/features/dashboard/metrics";
import { GettingStarted } from "@/features/onboarding/getting-started";
import { loadStaleness } from "@/features/products/queries";
import type { CatalogProduct } from "@/features/products/catalog-schema";
import type { PricingRow } from "@/features/products/schema";
import { DEFAULT_SETTINGS, type SettingsRow } from "@/features/settings/schema";
import { createClient } from "@/lib/supabase/server";
import { daysUntil, formatBRL, formatDateTime, formatPercent } from "@/lib/utils";

export const metadata = { title: "Painel" };

type Entitlement = { plan_code: string; status: string; limits: Record<string, number | null>; active: boolean };
type Latest = Pick<PricingRow, "product_id" | "unit_price" | "unit_profit" | "margin_percent">;
type Recent = Pick<PricingRow, "id" | "product_id" | "unit_price" | "margin_percent" | "created_at">;


export default async function DashboardPage() {
  const supabase = await createClient();
  const [printers, filaments, products, latestRes, recentRes, settingsRes, ent, sub, profile, quotesRes] = await Promise.all([
    supabase.from("printers").select("id", { count: "exact", head: true }),
    supabase.from("filaments").select("id", { count: "exact", head: true }),
    supabase.from("products").select("id, name, pricing_id, production_cost, sale_price, printer_id, filament_id, archived_at"),
    supabase.from("latest_pricings").select("product_id, unit_price, unit_profit, margin_percent"),
    supabase.from("pricings").select("id, product_id, unit_price, margin_percent, created_at").order("created_at", { ascending: false }).limit(5),
    supabase.from("cost_settings").select("*").maybeSingle(),
    supabase.rpc("current_entitlements"),
    supabase.from("subscriptions").select("status, trial_ends_at, plan:plans(name)").in("status", ["trialing", "active", "past_due"]).maybeSingle(),
    supabase.from("profiles").select("full_name, business_name, onboarding_done_at").maybeSingle(),
    supabase.from("quotes").select("status, total, internal_cost_total").limit(1000),
  ]);

  // Primeiro acesso: leva ao assistente de configuração (ele pode ser pulado e não volta a aparecer).
  if (profile.data && !profile.data.onboarding_done_at) redirect("/boas-vindas");

  const s = (settingsRes.data as SettingsRow | null) ?? DEFAULT_SETTINGS;
  const latest = (latestRes.data ?? []) as Latest[];
  const recent = (recentRes.data ?? []) as Recent[];
  const productRows = (products.data ?? []) as (Pick<CatalogProduct, "id" | "name" | "pricing_id" | "production_cost" | "sale_price" | "printer_id" | "filament_id" | "archived_at">)[];
  const activeProducts = productRows.filter((p) => !p.archived_at);
  const names = new Map(productRows.map((p) => [p.id, p.name]));
  const qm = quoteMetrics((quotesRes.data ?? []) as QuoteForMetrics[]);
  const staleCount = [...(await loadStaleness(supabase, activeProducts)).values()].filter((x) => x.stale).length;
  const belowTarget = latest.filter((l) => l.margin_percent < s.margin_percent - 1).length;

  const entitlement = (ent.data as Entitlement[] | null)?.[0];
  const trialEnds = sub.data?.status === "trialing" && sub.data.trial_ends_at ? new Date(sub.data.trial_ends_at) : null;
  const daysLeft = trialEnds ? daysUntil(trialEnds) : null;
  const firstName = profile.data?.full_name?.split(" ")[0];

  return (
    <>
      <PageHeader
        title={firstName ? `Olá, ${firstName}` : "Painel"}
        description={profile.data?.business_name ? `${profile.data.business_name} · resumo do seu negócio` : "Resumo do seu negócio"}
      />

      <GettingStarted
        printers={printers.count ?? 0}
        filaments={filaments.count ?? 0}
        hasSettings={Boolean(settingsRes.data)}
        pricings={latest.length}
      />

      <Link
        href="/calculadora"
        className="group mb-8 flex items-center justify-between rounded-3xl bg-ink p-6 text-paper transition-colors hover:bg-black"
      >
        <div>
          <p className="text-sm opacity-70">Comece por aqui</p>
          <p className="mt-1 text-2xl font-bold tracking-tight">Nova precificação</p>
          <p className="mt-1 text-sm opacity-70">Descubra o preço certo de uma peça em menos de um minuto.</p>
        </div>
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent text-ink">
          <Calculator />
        </span>
      </Link>

      <section aria-labelledby="h-orcado" className="mb-8" data-testid="indicadores">
        <h2 id="h-orcado" className="text-lg font-semibold">Seu catálogo e seus orçamentos</h2>
        <p className="mb-3 text-sm text-muted">
          Valores <strong>orçados</strong>: o PrintUp ainda não registra vendas ou pagamentos, então aprovado não significa recebido.
        </p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Kpi label="Produtos cadastrados" value={String(activeProducts.length)} href="/produtos" />
          <Kpi label="Orçamentos criados" value={String(qm.created)} href="/orcamentos" detail={qm.created > 0 ? `${qm.awaiting} aguardando · ${qm.drafts} rascunho${qm.drafts === 1 ? "" : "s"}` : undefined} />
          <Kpi label="Orçamentos aprovados" value={String(qm.approved)} href="/orcamentos?status=aprovado" />
          <Kpi label="Valor aprovado (orçado)" value={formatBRL(qm.approvedTotal)} href="/orcamentos?status=aprovado" tone={qm.approved > 0 ? "ok" : undefined} />
          <Kpi
            label="Lucro estimado dos aprovados"
            value={qm.estimatedProfit === null ? "—" : formatBRL(qm.estimatedProfit)}
            tone={qm.estimatedProfit !== null ? "ok" : undefined}
            detail={
              qm.estimatedProfit === null
                ? qm.approved > 0 ? "Sem custo de produção nos aprovados" : "Aparece quando houver aprovados"
                : `Aprovado − custo de produção${qm.approvedWithoutCost > 0 ? ` · ${qm.approvedWithoutCost} sem custo ficou de fora` : ""}`
            }
          />
        </div>
        {qm.created === 0 && (
          <Card className="mt-3 text-sm text-muted">
            <p className="font-medium text-ink">Nenhum orçamento ainda.</p>
            <p className="mt-1">Salve um preço como produto e <Link href="/orcamentos/novo" className="font-medium text-accent-strong underline">crie seu primeiro orçamento</Link> em PDF.</p>
          </Card>
        )}
        {(belowTarget > 0 || staleCount > 0) && (
          <div className="mt-3 space-y-2">
            {belowTarget > 0 && (
              <p className="rounded-xl bg-accent-soft px-3 py-2 text-sm text-warn">
                {belowTarget} produto{belowTarget > 1 ? "s estão" : " está"} abaixo da sua margem padrão de {formatPercent(s.margin_percent)}.{" "}
                <Link href="/produtos" className="font-medium underline">Ver produtos</Link>
              </p>
            )}
            {staleCount > 0 && (
              <p className="flex flex-wrap items-center gap-2 rounded-xl bg-accent-soft px-3 py-2 text-sm text-warn">
                <RefreshCw size={14} aria-hidden="true" />
                {staleCount} produto{staleCount > 1 ? "s têm" : " tem"} custos diferentes dos de hoje.{" "}
                <Link href="/produtos/recalcular" className="font-medium underline">Revisar e recalcular</Link>
              </p>
            )}
          </div>
        )}
      </section>

      <section aria-labelledby="h-recentes" className="mb-8">
        <h2 id="h-recentes" className="mb-3 text-lg font-semibold">Produtos precificados recentemente</h2>
        {recent.length === 0 ? (
          <Card className="text-sm text-muted">
            <p className="font-medium text-ink">Nada precificado ainda.</p>
            <p className="mt-1">Faça um cálculo e use <strong>Salvar como produto</strong>: ele aparece aqui, com preço e margem.</p>
          </Card>
        ) : (
          <Card className="p-0">
            <ul className="divide-y divide-line">
              {recent.map((r) => (
                <li key={r.id}>
                  <Link href={`/produtos/${r.product_id}`} className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-paper">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{names.get(r.product_id) ?? "Produto"}</span>
                      <span className="num block text-xs text-muted">{formatDateTime(r.created_at)}</span>
                    </span>
                    <span className="num shrink-0 text-right">{formatBRL(r.unit_price)}<span className="block text-xs text-muted">margem {formatPercent(r.margin_percent)}</span></span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      <section aria-labelledby="h-atalhos" className="mb-8">
        <h2 id="h-atalhos" className="mb-3 text-lg font-semibold">Atalhos</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Shortcut href="/calculadora" icon={<Calculator size={20} />} title="Nova precificação" detail="Calcule custo e preço" />
          <Shortcut href="/importar" icon={<FileUp size={20} />} title="Importar modelo" detail="3MF, G-code ou manual" />
          <Shortcut href="/produtos/novo" icon={<PackagePlus size={20} />} title="Cadastrar produto" detail="Direto no catálogo" />
          <Shortcut href="/orcamentos/novo" icon={<FilePlus2 size={20} />} title="Criar orçamento" detail="Com PDF para o cliente" />
          <Shortcut href="/impressoras/nova" icon={<Printer size={20} />} title="Cadastrar impressora" detail={usage(printers.count, entitlement?.limits.max_printers)} />
          <Shortcut href="/filamentos/novo" icon={<Layers size={20} />} title="Cadastrar filamento" detail={usage(filaments.count, entitlement?.limits.max_filaments)} />
        </div>
      </section>

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

function Kpi({ label, value, tone, detail, href }: { label: string; value: string; tone?: "ok"; detail?: string; href?: string }) {
  const inner = (
    <Card className={`h-full p-4 ${href ? "transition-colors hover:border-accent" : ""}`}>
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={`num mt-1 text-2xl font-semibold ${tone === "ok" ? "text-ok" : ""}`}>{value}</p>
      {detail && <p className="mt-1 text-xs text-muted">{detail}</p>}
    </Card>
  );
  return href ? <Link href={href} className="block">{inner}</Link> : inner;
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
