import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { OrderStatusBadge, OverdueBadge, PaymentBadge } from "@/features/orders/badges";
import { loadOrders } from "@/features/orders/server";
import { isOrderOverdue, ORDER_STATUSES, ORDER_STATUS_LABEL, PAYMENT_STATUSES, PAYMENT_STATUS_LABEL } from "@/features/orders/status";
import { formatDateBR, formatQuoteNumber, todayBR } from "@/features/quotes/status";
import { createClient } from "@/lib/supabase/server";
import { cn, formatBRL } from "@/lib/utils";

export const metadata = { title: "Pedidos" };

type SP = { status?: string; pagamento?: string; q?: string; de?: string; ate?: string; impressora?: string; atrasados?: string };
const OPEN = ["novo", "aguardando_pagamento", "em_producao", "pronto"];

export default async function OrdersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ orders, jobs, fin }, printers] = await Promise.all([loadOrders(supabase), supabase.from("printers").select("id, name").order("name")]);
  const today = todayBR();
  const q = (sp.q ?? "").trim().toLowerCase();
  const byPrinter = sp.impressora ? new Set(jobs.filter((j) => j.printer_id === sp.impressora).map((j) => j.order_id)) : null;

  const rows = orders.filter((o) => {
    if (sp.status && o.status !== sp.status) return false;
    if (sp.pagamento && o.payment_status !== sp.pagamento) return false;
    if (q && !`${o.customer_name} ${o.number}`.toLowerCase().includes(q)) return false;
    if (sp.de && o.order_date < sp.de) return false;
    if (sp.ate && o.order_date > sp.ate) return false;
    if (byPrinter && !byPrinter.has(o.id)) return false;
    if (sp.atrasados === "1" && !isOrderOverdue(o.status, o.due_date, today)) return false;
    return true;
  });
  const open = orders.filter((o) => OPEN.includes(o.status)).length;
  const inProd = orders.filter((o) => o.status === "em_producao").length;
  const late = orders.filter((o) => isOrderOverdue(o.status, o.due_date, today)).length;

  return (
    <>
      <PageHeader title="Pedidos" description="Do orçamento aprovado até a entrega, com produção e pagamento acompanhados separadamente." action={<Button asChild><Link href="/pedidos/novo"><Plus size={18} />Novo pedido</Link></Button>} />

      <div className="mb-4 grid grid-cols-3 gap-3" data-testid="resumo-pedidos">
        <Card className="p-3"><p className="text-xs text-muted">Em aberto</p><p className="num text-xl font-semibold">{open}</p></Card>
        <Card className="p-3"><p className="text-xs text-muted">Em produção</p><p className="num text-xl font-semibold">{inProd}</p></Card>
        <Link href="/pedidos?atrasados=1" className="block"><Card className={cn("p-3", late > 0 && "border-danger/40")}><p className="text-xs text-muted">Atrasados</p><p className={cn("num text-xl font-semibold", late > 0 && "text-danger")}>{late}</p></Card></Link>
      </div>

      <form className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" role="search" aria-label="Filtrar pedidos">
        <Input name="q" type="search" defaultValue={sp.q ?? ""} placeholder="Cliente ou nº do pedido…" aria-label="Buscar" />
        <Select name="status" defaultValue={sp.status ?? ""} aria-label="Status do pedido">
          <option value="">Todos os status</option>
          {ORDER_STATUSES.map((s) => <option key={s} value={s}>{ORDER_STATUS_LABEL[s]}</option>)}
        </Select>
        <Select name="pagamento" defaultValue={sp.pagamento ?? ""} aria-label="Pagamento">
          <option value="">Todos os pagamentos</option>
          {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{PAYMENT_STATUS_LABEL[s]}</option>)}
        </Select>
        <Select name="impressora" defaultValue={sp.impressora ?? ""} aria-label="Impressora">
          <option value="">Todas as impressoras</option>
          {(printers.data ?? []).map((p) => <option key={p.id as string} value={p.id as string}>{p.name as string}</option>)}
        </Select>
        <Input name="de" type="date" defaultValue={sp.de ?? ""} aria-label="Pedidos a partir de" />
        <Input name="ate" type="date" defaultValue={sp.ate ?? ""} aria-label="Pedidos até" />
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="atrasados" value="1" defaultChecked={sp.atrasados === "1"} className="h-5 w-5 accent-accent" />Só atrasados</label>
        <div className="flex gap-2"><Button type="submit" variant="secondary">Filtrar</Button><Button asChild variant="ghost"><Link href="/pedidos">Limpar</Link></Button></div>
      </form>

      {rows.length === 0 ? (
        <Card className="text-center text-muted">
          {orders.length === 0 ? (
            <>Nenhum pedido ainda. Aprove um <Link href="/orcamentos" className="font-medium text-accent-strong underline">orçamento</Link> e use “Transformar em pedido”, ou <Link href="/pedidos/novo" className="font-medium text-accent-strong underline">crie um pedido manual</Link>.</>
          ) : (
            "Nenhum pedido neste filtro."
          )}
        </Card>
      ) : (
        <ul className="space-y-3" data-testid="lista-pedidos">
          {rows.map((o) => {
            const f = fin.get(o.id);
            const overdue = isOrderOverdue(o.status, o.due_date, today);
            return (
              <li key={o.id}>
                <Link href={`/pedidos/${o.id}`} className="block">
                  <Card className="space-y-2 p-4 hover:border-accent">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2"><span className="num text-sm text-muted">{formatQuoteNumber(o.number)}</span><span className="truncate font-medium">{o.customer_name}</span></p>
                        <p className="text-xs text-muted">Pedido em {formatDateBR(o.order_date)}{o.due_date ? ` · entrega até ${formatDateBR(o.due_date)}` : " · sem prazo"}</p>
                      </div>
                      <div className="text-right">
                        <p className="num font-semibold">{formatBRL(o.total)}</p>
                        {f && f.toReceive > 0 && <p className="num text-xs text-muted">a receber {formatBRL(f.toReceive)}</p>}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5"><OrderStatusBadge status={o.status} /><PaymentBadge status={o.payment_status} />{overdue && <OverdueBadge />}</div>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
