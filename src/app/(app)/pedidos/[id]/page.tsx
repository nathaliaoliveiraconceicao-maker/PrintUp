import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import { Card, PageHeader } from "@/components/ui/card";
import { OrderStatusBadge, OverdueBadge, PaymentBadge } from "@/features/orders/badges";
import { orderFinancials } from "@/features/orders/financials";
import { OrderActions } from "@/features/orders/order-actions";
import { OrderDetailsForm } from "@/features/orders/order-details-form";
import { PaymentsPanel } from "@/features/orders/payments-panel";
import { JOB_COLUMNS, ORDER_COLUMNS, ORDER_ITEM_COLUMNS, type JobRow, type OrderItemRow, type OrderRow, type PaymentRow } from "@/features/orders/schema";
import { isJobOverdue, isOrderOverdue, orderIsEditable, PAYMENT_METHOD_LABEL } from "@/features/orders/status";
import { JobCard } from "@/features/production/job-card";
import { JobForm } from "@/features/production/job-form";
import { formatDateBR, formatQuoteNumber, todayBR } from "@/features/quotes/status";
import { createClient } from "@/lib/supabase/server";
import { formatBRL, formatPercent } from "@/lib/utils";

export const metadata = { title: "Pedido" };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("orders").select(ORDER_COLUMNS).eq("id", id).maybeSingle();
  if (!data) notFound();
  const o = data as OrderRow;
  const [it, jb, pay, resv, printers, filaments] = await Promise.all([
    supabase.from("order_items").select(ORDER_ITEM_COLUMNS).eq("order_id", id).order("position"),
    supabase.from("production_jobs").select(JOB_COLUMNS).eq("order_id", id).order("created_at"),
    supabase.from("order_payments").select("id, order_id, kind, amount, method, paid_at, note").eq("order_id", id).order("created_at"),
    supabase.from("job_reservations").select("job_id, grams"),
    supabase.from("printers").select("id, name").eq("is_active", true).order("name"),
    supabase.from("filaments").select("id, name").eq("is_active", true).order("name"),
  ]);
  const items = (it.data ?? []) as OrderItemRow[];
  const jobs = (jb.data ?? []) as JobRow[];
  const payments = (pay.data ?? []) as PaymentRow[];
  const reserved = new Map<string, number>();
  for (const r of (resv.data ?? []) as { job_id: string; grams: number }[]) reserved.set(r.job_id, (reserved.get(r.job_id) ?? 0) + r.grams);

  const today = todayBR();
  const f = orderFinancials({ status: o.status, total: o.total, estimated_cost: o.estimated_cost, amount_paid: o.amount_paid, items, jobs });
  const overdue = isOrderOverdue(o.status, o.due_date, today);
  const hasJobs = jobs.some((j) => j.stage !== "cancelado");
  const editable = orderIsEditable(o.status, hasJobs);
  const deletable = o.status === "novo" && !hasJobs && payments.length === 0;
  const failures = jobs.reduce((a, j) => a + j.failed_count, 0);
  const locked = o.status === "cancelado";
  const orderInfo = { id: o.id, number: o.number, customer: o.customer_name, due: o.due_date };

  return (
    <>
      <Link href="/pedidos" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft size={14} /> Pedidos</Link>
      <PageHeader
        title={`Pedido ${formatQuoteNumber(o.number)}`}
        description={`${o.customer_name}${o.customer_phone ? ` · ${o.customer_phone}` : ""} · pedido em ${formatDateBR(o.order_date)}${o.due_date ? ` · entrega até ${formatDateBR(o.due_date)}` : ""}`}
        action={<div className="flex flex-wrap gap-1.5"><OrderStatusBadge status={o.status} /><PaymentBadge status={o.payment_status} />{overdue && <OverdueBadge />}</div>}
      />

      {overdue && <Card className="mb-4 border-danger/40 bg-danger/5 text-sm" role="alert">O prazo de entrega ({formatDateBR(o.due_date as string)}) já passou e o pedido ainda não foi entregue.</Card>}
      {failures > 0 && o.status !== "cancelado" && <Card className="mb-4 bg-accent-soft/50 text-sm">Houve {failures} falha{failures > 1 ? "s" : ""} de impressão neste pedido. O material perdido já saiu do estoque e entra no custo real.</Card>}

      <Card className="mb-6 space-y-3">
        <OrderActions id={id} status={o.status} editable={editable} deletable={deletable} />
        {o.quote_id && <p className="text-sm text-muted"><FileText size={14} className="mr-1 inline" aria-hidden="true" />Veio do <Link href={`/orcamentos/${o.quote_id}`} className="font-medium text-accent-strong underline">orçamento de origem</Link>.</p>}
      </Card>

      <section aria-labelledby="h-itens" className="mb-6 space-y-3">
        <h2 id="h-itens" className="text-lg font-semibold">Itens e produção</h2>
        {items.map((i) => {
          const itemJobs = jobs.filter((j) => j.order_item_id === i.id);
          const assigned = itemJobs.filter((j) => j.stage !== "cancelado").reduce((a, j) => a + j.quantity, 0);
          const done = itemJobs.filter((j) => j.stage === "concluido").reduce((a, j) => a + j.quantity, 0);
          return (
            <Card key={i.id} className="space-y-3" data-testid="item-do-pedido">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{i.name}</p>
                  <p className="num text-xs text-muted">{i.quantity} × {formatBRL(i.unit_price)}{i.discount_percent > 0 ? ` − ${formatPercent(i.discount_percent)}` : ""}</p>
                </div>
                <span className="num font-medium">{formatBRL(i.line_total)}</span>
              </div>
              {i.needs_production ? (
                <>
                  <p className="text-xs text-muted">{done} de {i.quantity} unidade(s) concluída(s) · {assigned} em lotes{i.weight_g === null ? " · produto sem peso cadastrado" : ""}</p>
                  {!locked && o.status !== "entregue" && (
                    <JobForm itemId={i.id} itemName={i.name} remaining={i.quantity - assigned} weightG={i.weight_g} defaultFilamentId={i.filament_id} defaultPrinterId={i.printer_id} printers={(printers.data ?? []) as { id: string; name: string }[]} filaments={(filaments.data ?? []) as { id: string; name: string }[]} />
                  )}
                  {itemJobs.length > 0 && (
                    <div className="grid gap-3 md:grid-cols-2">
                      {itemJobs.map((j) => <JobCard key={j.id} job={j} order={orderInfo} reservedG={reserved.get(j.id) ?? 0} overdue={isJobOverdue(j.stage, o.due_date, o.status, today)} showOrder={false} />)}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-xs text-muted">Personalização/serviço: não vai para a fila de impressão.</p>
              )}
            </Card>
          );
        })}
        <Card className="space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-muted">Subtotal</span><span className="num">{formatBRL(o.subtotal)}</span></div>
          {o.discount_total > 0 && <div className="flex justify-between"><span className="text-muted">Desconto</span><span className="num">- {formatBRL(o.discount_total)}</span></div>}
          <div className="flex items-baseline justify-between border-t border-line pt-2"><span className="font-semibold">Total</span><span className="num text-2xl font-semibold text-accent-strong">{formatBRL(o.total)}</span></div>
        </Card>
      </section>

      <section aria-labelledby="h-pag" className="mb-6 space-y-3">
        <h2 id="h-pag" className="text-lg font-semibold">Pagamento</h2>
        <Card className="space-y-4">
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Stat label="Total" value={formatBRL(o.total)} />
            <Stat label="Recebido" value={formatBRL(f.received)} tone="ok" />
            <Stat label="A receber" value={formatBRL(f.toReceive)} />
            <Stat label="Forma" value={o.payment_method ? PAYMENT_METHOD_LABEL[o.payment_method] : "A definir"} />
          </dl>
          <PaymentsPanel orderId={id} payments={payments} balance={f.toReceive} received={f.received} cancelled={locked} />
        </Card>
        <Card><OrderDetailsForm orderId={id} dueDate={o.due_date} method={o.payment_method} notes={o.notes} locked={locked} /></Card>
      </section>

      <section aria-labelledby="h-fin" className="mb-6 space-y-3" data-testid="financeiro-pedido">
        <h2 id="h-fin" className="text-lg font-semibold">Custos e lucro</h2>
        <Card className="space-y-4">
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <Stat label="Custo estimado" value={f.estimatedCost !== null ? formatBRL(f.estimatedCost) : "—"} />
            <Stat label="Lucro estimado" value={f.estimatedProfit !== null ? formatBRL(f.estimatedProfit) : "—"} />
            <Stat label={f.realCost !== null ? "Custo real" : "Custo registrado até agora"} value={formatBRL(f.realCost ?? f.recordedCost)} />
            <Stat label="Receita recebida" value={formatBRL(f.received)} tone="ok" />
            <Stat label="Lucro realizado" value={f.realizedProfit !== null ? formatBRL(f.realizedProfit) : "—"} tone={f.realizedProfit !== null ? "ok" : undefined} />
          </dl>
          <p className="text-xs text-muted" data-testid="explica-lucro">
            {f.realizedBasis === "em_andamento" && "O lucro realizado aparece quando toda a produção for concluída: até lá o custo real está incompleto."}
            {f.realizedBasis === "completo" && "Pedido quitado e produção concluída: lucro realizado = recebido − custo real."}
            {f.realizedBasis === "proporcional" && "Pagamento parcial: o custo real é reconhecido na mesma proporção do que foi recebido (recebido ÷ total)."}
            {f.realizedBasis === "cancelado" && "Pedido cancelado: lucro realizado = o que ficou recebido − o custo já gasto (consumo e falhas)."}
            {f.usedEstimateFallback && " Alguma tarefa concluída não tinha consumo real e entrou pelo custo estimado."}
          </p>
        </Card>
      </section>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "ok" }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`num font-medium ${tone === "ok" ? "text-ok" : ""}`}>{value}</dd>
    </div>
  );
}
