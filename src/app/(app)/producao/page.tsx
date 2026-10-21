import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { JobCard } from "@/features/production/job-card";
import { JOB_COLUMNS, ORDER_COLUMNS, type JobRow, type OrderRow } from "@/features/orders/schema";
import { isJobOverdue, JOB_STAGE_LABEL, JOB_STAGES, type JobStage } from "@/features/orders/status";
import { todayBR } from "@/features/quotes/status";
import { PlanNotice } from "@/components/plan-notice";
import { loadEntitlements } from "@/features/billing/server";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata = { title: "Produção" };

const RECENT_DONE = 20;

export default async function ProductionPage({ searchParams }: { searchParams: Promise<{ impressora?: string; atrasados?: string; q?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const entitlement = await loadEntitlements(supabase);
  const [jobsRes, ordersRes, resv, printers] = await Promise.all([
    supabase.from("production_jobs").select(JOB_COLUMNS).neq("stage", "cancelado").order("created_at"),
    supabase.from("orders").select(ORDER_COLUMNS),
    supabase.from("job_reservations").select("job_id, grams"),
    supabase.from("printers").select("id, name").order("name"),
  ]);
  const today = todayBR();
  const orders = new Map(((ordersRes.data ?? []) as OrderRow[]).map((o) => [o.id, o]));
  const reserved = new Map<string, number>();
  for (const r of (resv.data ?? []) as { job_id: string; grams: number }[]) reserved.set(r.job_id, (reserved.get(r.job_id) ?? 0) + r.grams);

  const all = ((jobsRes.data ?? []) as JobRow[]).map((j) => {
    const o = orders.get(j.order_id);
    return { j, o, overdue: o ? isJobOverdue(j.stage, o.due_date, o.status, today) : false };
  });
  const q = (sp.q ?? "").trim().toLowerCase();
  const filtered = all.filter(({ j, o, overdue }) => {
    if (sp.impressora && j.printer_id !== sp.impressora) return false;
    if (sp.atrasados === "1" && !overdue) return false;
    if (q && !`${j.product_name} ${o?.customer_name ?? ""} ${o?.number ?? ""}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const overdueCount = all.filter((x) => x.overdue).length;
  const noReserveCount = all.filter(({ j }) => j.stage !== "concluido" && (j.est_grams ?? 0) > 0 && j.filament_id && (reserved.get(j.id) ?? 0) < (j.est_grams ?? 0) - 0.01).length;

  return (
    <>
      <PlanNotice entitlement={entitlement} feature="production" />
      <PageHeader title="Produção" description="Acompanhe cada lote do pedido até ficar pronto. Crie os lotes dentro do pedido." action={<Button asChild variant="secondary"><Link href="/pedidos">Ver pedidos</Link></Button>} />

      {(overdueCount > 0 || noReserveCount > 0) && (
        <div className="mb-4 space-y-2" data-testid="avisos-producao">
          {overdueCount > 0 && (
            <p role="alert" className="flex items-center gap-2 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
              <AlertTriangle size={16} aria-hidden="true" />
              {overdueCount} tarefa{overdueCount > 1 ? "s estão atrasadas" : " está atrasada"} (prazo do pedido vencido).{" "}
              <Link href="/producao?atrasados=1" className="font-medium underline">Ver só as atrasadas</Link>
            </p>
          )}
          {noReserveCount > 0 && (
            <p className="flex items-center gap-2 rounded-xl bg-accent-soft px-3 py-2 text-sm text-warn">
              <AlertTriangle size={16} aria-hidden="true" />
              {noReserveCount} tarefa{noReserveCount > 1 ? "s estão" : " está"} sem material reservado. Veja o <Link href="/estoque" className="font-medium underline">estoque</Link>.
            </p>
          )}
        </div>
      )}

      <form className="mb-4 grid gap-3 sm:grid-cols-[1fr_220px_auto_auto]" role="search" aria-label="Filtrar produção">
        <Input name="q" type="search" defaultValue={sp.q ?? ""} placeholder="Buscar produto, cliente ou nº do pedido…" aria-label="Buscar" />
        <Select name="impressora" defaultValue={sp.impressora ?? ""} aria-label="Impressora">
          <option value="">Todas as impressoras</option>
          {(printers.data ?? []).map((p) => <option key={p.id as string} value={p.id as string}>{p.name as string}</option>)}
        </Select>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="atrasados" value="1" defaultChecked={sp.atrasados === "1"} className="h-5 w-5 accent-accent" />Só atrasadas</label>
        <Button type="submit" variant="secondary">Filtrar</Button>
      </form>

      {all.length === 0 ? (
        <Card className="text-center text-muted">
          Nenhuma tarefa de produção ainda. Abra um <Link href="/pedidos" className="font-medium text-accent-strong underline">pedido</Link> e use <strong>Criar lote de produção</strong>.
        </Card>
      ) : (
        <div className="-mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-4 lg:mx-0 lg:px-0" data-testid="kanban">
          {JOB_STAGES.map((stage) => {
            let col = filtered.filter((x) => x.j.stage === stage);
            if (stage === "concluido") col = col.slice(-RECENT_DONE).reverse();
            return (
              <section key={stage} aria-labelledby={`col-${stage}`} data-testid={`coluna-${stage}`} className={cn("w-[85vw] shrink-0 snap-center space-y-3 self-start rounded-2xl bg-paper p-3 sm:w-80", stage === "concluido" && "opacity-95")}>
                <h2 id={`col-${stage}`} className="flex items-center justify-between px-1 text-sm font-semibold">
                  {JOB_STAGE_LABEL[stage as JobStage]}
                  <span className="num rounded-full bg-surface px-2 py-0.5 text-xs text-muted">{col.length}</span>
                </h2>
                {col.length === 0 ? (
                  <p className="px-1 py-4 text-center text-xs text-muted">Nada aqui.</p>
                ) : (
                  col.map(({ j, o, overdue }) => (
                    <JobCard key={j.id} job={j} order={{ id: j.order_id, number: o?.number ?? 0, customer: o?.customer_name ?? "—", due: o?.due_date ?? null }} reservedG={reserved.get(j.id) ?? 0} overdue={overdue} />
                  ))
                )}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
