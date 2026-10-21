import Link from "next/link";
import { Card, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { requireAdminPage } from "@/features/admin/guard";
import { parsePeriod } from "@/features/admin/schema";
import { loadOverview } from "@/features/admin/server";
import { brl, Stat, stateLabel } from "@/features/admin/ui";
import { cn } from "@/lib/utils";

export const metadata = { title: "Visão geral · Administração" };
const PRESETS = [["7d", "7 dias"], ["30d", "30 dias"], ["90d", "90 dias"]] as const;

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ periodo?: string; de?: string; ate?: string }> }) {
  const { supabase } = await requireAdminPage();
  const sp = await searchParams;
  const period = parsePeriod(sp);
  const o = await loadOverview(supabase, period.from, period.to);
  const st = (k: string) => o.por_estado[k] ?? 0;
  const plans = Object.entries(o.por_plano).sort((a, b) => b[1] - a[1]);
  const totalPlans = plans.reduce((s, [, n]) => s + n, 0) || 1;

  return (
    <>
      <PageHeader title="Visão geral" description={`Dados reais · ${period.label}`} />
      <div className="mb-6 flex flex-wrap items-end gap-2" data-testid="filtro-periodo">
        {PRESETS.map(([k, l]) => (
          <Link key={k} href={`/admin?periodo=${k}`} aria-current={period.key === k ? "true" : undefined} className={cn("flex h-11 items-center rounded-xl border px-4 text-sm font-medium", period.key === k ? "border-ink bg-ink text-paper" : "border-line hover:bg-paper")}>{l}</Link>
        ))}
        <form className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="periodo" value="personalizado" />
          <Field label="De"><Input type="date" name="de" defaultValue={sp.de} required /></Field>
          <Field label="Até"><Input type="date" name="ate" defaultValue={sp.ate} required /></Field>
          <Button variant="secondary">Aplicar</Button>
        </form>
      </div>

      <section aria-labelledby="h-receita" className="mb-8 space-y-3">
        <h2 id="h-receita" className="text-lg font-semibold">Receita</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat testId="mrr" label="MRR (recorrente contratada)" value={brl(o.mrr_cents)} hint="Assinaturas pagas ativas, mensalizadas. Não inclui teste nem cortesia." />
          <Stat testId="arr" label="ARR (anualizada)" value={brl(o.arr_cents)} hint="MRR × 12 — projeção, não é dinheiro recebido." />
          <Stat testId="recebido" label="Recebido no período" value={brl(o.recebido_cents)} hint={`Cobranças efetivamente confirmadas${o.estornado_cents ? ` · estornado: ${brl(o.estornado_cents)}` : ""}.`} />
          <Stat testId="churn" label="Taxa de cancelamento" value={o.taxa_cancelamento === null ? "—" : `${(o.taxa_cancelamento * 100).toFixed(1).replace(".", ",")}%`} hint={`${o.cancelamentos_periodo} cancelamento(s) sobre ${o.base_inicio_periodo} assinatura(s) paga(s) no início. Aproximação.`} />
        </div>
        {o.mrr_em_cancelamento_cents > 0 && <p className="text-sm text-muted">MRR com cancelamento agendado (sai no fim do período): {brl(o.mrr_em_cancelamento_cents)} — não incluído no MRR acima.</p>}
      </section>

      <section aria-labelledby="h-usuarios" className="mb-8 space-y-3">
        <h2 id="h-usuarios" className="text-lg font-semibold">Usuários e assinaturas</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat testId="usuarios-total" label="Usuários cadastrados" value={o.usuarios_total} />
          <Stat testId="usuarios-novos" label="Novos no período" value={o.usuarios_novos} />
          <Stat testId="ativas" label="Assinaturas ativas" value={st("ativo")} hint={st("pagamento_pendente") ? `+ ${st("pagamento_pendente")} com pagamento pendente` : undefined} />
          <Stat testId="em-teste" label="Em teste" value={st("em_teste")} />
          <Stat testId="canceladas" label="Canceladas" value={st("cancelado")} hint={st("cancelamento_agendado") ? `+ ${st("cancelamento_agendado")} com cancelamento agendado` : undefined} />
          <Stat testId="inadimplentes" label="Inadimplentes" value={st("inadimplente")} />
          <Stat label="Teste encerrado" value={st("expirado")} />
          <Stat label="No plano Gratuito" value={st("gratuito")} />
        </div>
      </section>

      <section aria-labelledby="h-planos" className="space-y-3">
        <h2 id="h-planos" className="text-lg font-semibold">Usuários por plano</h2>
        <Card data-testid="distribuicao-planos" className="space-y-3">
          {plans.length === 0 && <p className="text-sm text-muted">Sem usuários ainda.</p>}
          {plans.map(([code, n]) => (
            <div key={code}>
              <div className="flex justify-between text-sm"><span className="font-medium">{code === "trial" ? "Teste grátis" : code}</span><span className="num">{n} ({Math.round((n / totalPlans) * 100)}%)</span></div>
              <div className="mt-1 h-2 rounded-full bg-paper"><div className="h-2 rounded-full bg-accent" style={{ width: `${(n / totalPlans) * 100}%` }} /></div>
            </div>
          ))}
        </Card>
        <p className="text-xs text-muted">Plano efetivo (o que o cliente de fato usa hoje). Estados: {Object.keys(o.por_estado).map(stateLabel).join(", ") || "—"}.</p>
      </section>
    </>
  );
}
