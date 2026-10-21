import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Card, PageHeader } from "@/components/ui/card";
import { SettingsTabs } from "@/components/settings-tabs";
import { SubscriptionActions, SimulatorPanel } from "@/features/billing/subscription-actions";
import { loadCharges, loadEntitlements, loadPublicPlans, loadUsage } from "@/features/billing/server";
import { resolveGateway } from "@/lib/billing/gateway";
import { FEATURES, LIMIT_LABEL, limitText, needsAttention, percentUsed, STATE_ACCESS, STATE_LABEL, formatPriceCents } from "@/lib/billing/state";
import { createClient } from "@/lib/supabase/server";
import { cn, formatDateTime } from "@/lib/utils";
import { formatDateBR } from "@/features/quotes/status";

export const metadata = { title: "Minha assinatura" };

const CHARGE_LABEL = { pendente: "Pendente", recebida: "Paga", falhou: "Falhou", vencida: "Vencida", estornada: "Estornada", cancelada: "Cancelada" } as const;
const METHOD_LABEL = { cartao: "Cartão", pix: "Pix", boleto: "Boleto" } as const;

export default async function SubscriptionPage() {
  const supabase = await createClient();
  const [ent, usage, charges, plans, gw] = await Promise.all([loadEntitlements(supabase), loadUsage(supabase), loadCharges(supabase), loadPublicPlans(supabase), resolveGateway()]);
  const { data: sub } = await supabase.from("subscriptions").select("gateway_subscription_id, status").in("status", ["active", "past_due"]).not("gateway_subscription_id", "is", null).maybeSingle();
  const current = plans.find((p) => p.code === ent?.plan_code);
  const planName = ent?.plan_code === "trial" ? "Teste grátis" : (current?.name ?? ent?.plan_code ?? "Gratuito");
  const state = ent?.state ?? "gratuito";
  const paying = Boolean(sub);

  const rows: { key: string; used: number; limit: number | null | undefined; unit?: string }[] = [
    { key: "max_products", used: usage.products, limit: ent?.limits.max_products },
    { key: "max_printers", used: usage.printers, limit: ent?.limits.max_printers },
    { key: "max_filaments", used: usage.filaments, limit: ent?.limits.max_filaments },
    { key: "max_imports_month", used: usage.importsMonth, limit: ent?.limits.max_imports_month },
    { key: "max_pdf_month", used: usage.pdfMonth, limit: ent?.limits.max_pdf_month },
    { key: "max_storage_mb", used: Math.round(usage.storageBytes / 1048576), limit: ent?.limits.max_storage_mb },
  ];

  return (
    <>
      <PageHeader title="Minha assinatura" description="Plano, limites, cobranças e como alterar ou cancelar." />
      <SettingsTabs current="/assinatura" />

      {needsAttention(state) && (
        <Card className="mb-4 flex gap-3 border-warn/40 bg-accent-soft/50 text-sm" role="alert">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warn" aria-hidden="true" />
          <p>{STATE_ACCESS[state]}</p>
        </Card>
      )}

      <Card className="mb-6 space-y-3" data-testid="plano-atual">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted">Plano atual</p>
            <p className="text-2xl font-bold tracking-tight" data-testid="nome-plano">{planName}</p>
          </div>
          <span className={cn("rounded-full border px-3 py-1 text-sm font-medium", needsAttention(state) ? "border-warn/40 bg-accent-soft text-warn" : "border-line bg-paper")} data-testid="estado-assinatura">{STATE_LABEL[state]}</span>
        </div>
        <p className="text-sm text-muted">{STATE_ACCESS[state]}</p>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div><dt className="text-xs text-muted">Ciclo</dt><dd className="font-medium">{ent?.billing_cycle ? (ent.billing_cycle === "anual" ? "Anual" : "Mensal") : "—"}</dd></div>
          <div><dt className="text-xs text-muted">{ent?.cancel_at_period_end ? "Acesso até" : state === "em_teste" ? "Teste até" : "Próxima cobrança"}</dt><dd className="num font-medium">{ent?.period_end ? formatDateBR(ent.period_end.slice(0, 10)) : "—"}</dd></div>
          <div><dt className="text-xs text-muted">Valor</dt><dd className="num font-medium">{current && ent?.billing_cycle ? formatPriceCents(ent.billing_cycle === "anual" ? (current.price_yearly_cents ?? 0) : current.price_cents) : "—"}</dd></div>
          <div><dt className="text-xs text-muted">Troca agendada</dt><dd className="font-medium">{ent?.pending_plan_code ?? "—"}</dd></div>
        </dl>
        <div className="flex flex-wrap gap-2 pt-1">
          <Link href="/planos" className="inline-flex h-11 items-center rounded-xl bg-accent px-5 text-sm font-semibold text-ink hover:brightness-95">{paying ? "Alterar plano" : "Ver planos"}</Link>
        </div>
        <SubscriptionActions canCancel={paying && !ent?.cancel_at_period_end} hasGatewaySub={paying} />
      </Card>

      <section aria-labelledby="h-uso" className="mb-6 space-y-3" data-testid="uso-limites">
        <h2 id="h-uso" className="text-lg font-semibold">Limites e consumo</h2>
        <Card className="space-y-4">
          {rows.map((r) => {
            const pct = percentUsed(r.used, r.limit);
            return (
              <div key={r.key} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span>{LIMIT_LABEL[r.key]}</span>
                  <span className="num">{r.used.toLocaleString("pt-BR")} <span className="text-muted">de {limitText(r.limit)}</span></span>
                </div>
                {pct !== null && (
                  <div className="h-2 overflow-hidden rounded-full bg-paper" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Uso de ${LIMIT_LABEL[r.key]}`}>
                    <div className={cn("h-full rounded-full", pct >= 100 ? "bg-danger" : pct >= 80 ? "bg-warn" : "bg-accent")} style={{ width: `${pct}%` }} />
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      </section>

      <section aria-labelledby="h-rec" className="mb-6 space-y-3">
        <h2 id="h-rec" className="text-lg font-semibold">Recursos do seu plano</h2>
        <Card>
          <ul className="grid gap-2 text-sm sm:grid-cols-2">
            {Object.entries(FEATURES).map(([key, f]) => {
              const has = Boolean(ent?.features[key]);
              return (
                <li key={key} className={cn("flex items-center gap-2", !has && "text-muted")}>
                  <span aria-hidden="true" className={cn("flex h-5 w-5 items-center justify-center rounded-full text-xs", has && f.available ? "bg-ok text-white" : "bg-line")}>{has && f.available ? "✓" : "–"}</span>
                  <span>{f.label}{!f.available ? " (em breve)" : ""}</span>
                  <span className="sr-only">{has && f.available ? "incluído" : "não incluído"}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      </section>

      <section aria-labelledby="h-hist" className="mb-6 space-y-3" data-testid="historico-cobrancas">
        <h2 id="h-hist" className="text-lg font-semibold">Histórico de pagamentos</h2>
        {charges.length === 0 ? (
          <Card className="text-sm text-muted">Nenhuma cobrança ainda.</Card>
        ) : (
          <Card className="p-0">
            <ul className="divide-y divide-line text-sm">
              {charges.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="font-medium">{formatPriceCents(c.amount_cents)}{c.method ? ` · ${METHOD_LABEL[c.method]}` : ""}</p>
                    <p className="text-xs text-muted">{c.paid_at ? `Paga em ${formatDateTime(c.paid_at)}` : c.due_date ? `Vence em ${formatDateBR(c.due_date)}` : formatDateTime(c.created_at)}</p>
                  </div>
                  <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", c.status === "recebida" ? "bg-ok/10 text-ok" : c.status === "pendente" ? "bg-paper text-muted" : "bg-danger/10 text-danger")}>{CHARGE_LABEL[c.status]}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      {gw.enabled && gw.gateway.id === "simulado" && paying && <SimulatorPanel />}
      {!gw.enabled && <p className="text-xs text-muted">Pagamentos ainda não habilitados neste ambiente: nenhuma cobrança real é feita.</p>}
    </>
  );
}
