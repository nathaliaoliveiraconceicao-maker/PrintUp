import Link from "next/link";
import { Check, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PlanButton } from "@/features/billing/plan-actions";
import { loadEntitlements, loadPublicPlans, type PlanRow } from "@/features/billing/server";
import { resolveGateway } from "@/lib/billing/gateway";
import { FEATURES, LIMIT_LABEL, limitText, formatPriceCents } from "@/lib/billing/state";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata = { title: "Planos" };

const FAQ = [
  ["Posso testar antes de pagar?", "O plano Gratuito não expira e já inclui a calculadora. Quando o período de teste estiver habilitado, quem cria a conta começa com os recursos do Pro por alguns dias, sem cartão."],
  ["Posso cancelar quando quiser?", "Sim. O cancelamento vale no fim do período que você já pagou, sem multa. Depois disso você volta ao plano Gratuito."],
  ["O que acontece com meus dados se eu voltar ao Gratuito?", "Nada é apagado: produtos, orçamentos, pedidos e histórico continuam salvos e visíveis. Só não dá para cadastrar novos itens acima do limite do plano Gratuito ou usar os recursos pagos."],
  ["Se o preço mudar, minha assinatura muda?", "Não automaticamente. Uma assinatura em andamento mantém o valor contratado; mudanças de preço valem para novas contratações e, para quem já assina, só com aviso prévio."],
  ["Como é o pagamento?", "Pela página segura do serviço de pagamento, aberta ao contratar. O PrintUp não guarda dados do seu cartão. Seu plano só muda depois que o pagamento é confirmado."],
  ["Preciso de nota fiscal?", "A emissão de nota fiscal ainda não está integrada ao PrintUp. Fale com o suporte caso precise de comprovante."],
] as const;

export default async function PlansPage({ searchParams }: { searchParams: Promise<{ ciclo?: string }> }) {
  const sp = await searchParams;
  const cycle = sp.ciclo === "anual" ? "anual" : "mensal";
  const supabase = await createClient();
  const [plans, gw, auth] = await Promise.all([loadPublicPlans(supabase), resolveGateway(), supabase.auth.getUser()]);
  const user = auth.data.user;
  const ent = user ? await loadEntitlements(supabase) : null;
  const { data: sub } = user ? await supabase.from("subscriptions").select("id").in("status", ["active", "past_due"]).not("gateway_subscription_id", "is", null).maybeSingle() : { data: null };
  const hasYearly = plans.some((p) => (p.price_yearly_cents ?? 0) > 0);

  const price = (p: PlanRow) => (cycle === "anual" ? (p.price_yearly_cents ?? 0) : p.price_cents);
  const saving = (p: PlanRow) => (p.price_cents > 0 && p.price_yearly_cents ? Math.round((1 - p.price_yearly_cents / (p.price_cents * 12)) * 100) : 0);

  return (
    <>
      <section className="mx-auto mb-10 max-w-2xl text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">O plano certo para o seu ritmo de produção</h1>
        <p className="mt-3 text-muted">Comece de graça e evolua quando precisar de orçamentos, pedidos, estoque e produção.</p>
        {hasYearly && (
          <div className="mt-6 inline-grid grid-cols-2 gap-1 rounded-2xl border border-line bg-surface p-1" role="group" aria-label="Ciclo de cobrança">
            {(["mensal", "anual"] as const).map((c) => (
              <Link key={c} href={`/planos?ciclo=${c}`} aria-current={cycle === c ? "true" : undefined} className={cn("flex h-11 items-center justify-center rounded-xl px-5 text-sm font-semibold", cycle === c ? "bg-ink text-paper" : "text-muted hover:text-ink")}>
                {c === "mensal" ? "Mensal" : "Anual"}
              </Link>
            ))}
          </div>
        )}
      </section>

      {!gw.enabled && (
        <Card className="mx-auto mb-8 max-w-2xl bg-accent-soft/50 text-center text-sm" data-testid="aviso-pagamentos">
          <p className="font-medium">Os pagamentos ainda não estão habilitados.</p>
          <p className="text-muted">Você pode criar a conta e usar o plano Gratuito agora. Avisaremos quando os planos pagos puderem ser contratados.</p>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-3" data-testid="planos">
        {plans.map((p) => {
          const value = price(p);
          const isCurrent = ent?.plan_code === p.code;
          const features = Object.entries(FEATURES).filter(([k]) => p.features[k]);
          return (
            <Card key={p.code} className={cn("flex flex-col space-y-5 p-6", p.highlight && "border-accent ring-2 ring-accent/40")} data-testid={`card-${p.code}`}>
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-xl font-bold">{p.name}</h2>
                  {p.highlight && <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-ink">Mais escolhido</span>}
                </div>
                <p className="mt-1 text-sm text-muted">{p.description}</p>
              </div>
              <div>
                <p className="num text-4xl font-semibold tracking-tight">{value === 0 ? "R$ 0" : formatPriceCents(value)}<span className="text-base font-normal text-muted">{value === 0 ? "" : cycle === "anual" ? " /ano" : " /mês"}</span></p>
                {cycle === "anual" && saving(p) > 0 && <p className="text-xs text-ok">Economia de {saving(p)}% em relação ao mensal</p>}
              </div>

              <ul className="space-y-2 text-sm">
                {features.map(([k, f]) => (
                  <li key={k} className="flex items-start gap-2">
                    {f.available ? <Check size={16} className="mt-0.5 shrink-0 text-ok" aria-hidden="true" /> : <Clock size={16} className="mt-0.5 shrink-0 text-muted" aria-hidden="true" />}
                    <span className={f.available ? "" : "text-muted"}>{f.label}{!f.available && <span className="ml-1.5 rounded-full bg-line px-2 py-0.5 text-[11px] font-medium">em breve</span>}</span>
                  </li>
                ))}
              </ul>
              <ul className="space-y-1.5 border-t border-line pt-4 text-sm text-muted">
                {Object.keys(LIMIT_LABEL).filter((k) => k in p.limits).map((k) => (
                  <li key={k} className="flex justify-between gap-3"><span>{LIMIT_LABEL[k]}</span><span className="num font-medium text-ink">{limitText(p.limits[k])}</span></li>
                ))}
              </ul>

              <div className="mt-auto pt-2">
                {!user ? (
                  <Link href="/cadastro" className="flex h-11 w-full items-center justify-center rounded-xl bg-accent text-sm font-semibold text-ink hover:brightness-95">{p.price_cents === 0 ? "Começar grátis" : "Criar conta para contratar"}</Link>
                ) : isCurrent && (p.price_cents === 0 || ent?.billing_cycle === cycle) ? (
                  <p className="flex h-11 items-center justify-center rounded-xl border border-line text-sm font-medium" aria-current="true">Seu plano atual</p>
                ) : p.price_cents === 0 ? (
                  <p className="text-center text-xs text-muted">Para voltar ao Gratuito, cancele a assinatura em Minha assinatura.</p>
                ) : !gw.enabled ? (
                  <button disabled className="h-11 w-full rounded-xl bg-line text-sm font-semibold text-muted">Pagamentos em breve</button>
                ) : sub ? (
                  <PlanButton planCode={p.code} cycle={cycle} mode="alterar" label={`Mudar para ${p.name}`} />
                ) : (
                  <PlanButton planCode={p.code} cycle={cycle} mode="contratar" label={`Contratar ${p.name}`} />
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <section aria-labelledby="h-faq" className="mx-auto mt-14 max-w-3xl">
        <h2 id="h-faq" className="mb-4 text-2xl font-bold tracking-tight">Perguntas frequentes</h2>
        <div className="space-y-3">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group rounded-2xl border border-line bg-surface px-5 py-1">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold">{q}<span aria-hidden="true" className="text-muted transition-transform group-open:rotate-45">+</span></summary>
              <p className="pb-4 text-sm text-muted">{a}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}
