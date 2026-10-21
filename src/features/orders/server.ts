import type { SupabaseClient } from "@supabase/supabase-js";
import { orderFinancials, type OrderFinancials } from "./financials";
import { JOB_COLUMNS, ORDER_COLUMNS, ORDER_ITEM_COLUMNS, type JobRow, type OrderItemRow, type OrderRow } from "./schema";

export interface OrdersData {
  orders: OrderRow[];
  items: OrderItemRow[];
  jobs: JobRow[];
  fin: Map<string, OrderFinancials>;
}

/** Pedidos do usuário com itens, tarefas e o resumo financeiro de cada um (RLS limita ao dono). */
export async function loadOrders(supabase: SupabaseClient): Promise<OrdersData> {
  const [o, i, j] = await Promise.all([
    supabase.from("orders").select(ORDER_COLUMNS).order("number", { ascending: false }).limit(2000),
    supabase.from("order_items").select(ORDER_ITEM_COLUMNS).limit(10000),
    supabase.from("production_jobs").select(JOB_COLUMNS).limit(10000),
  ]);
  const orders = (o.data ?? []) as OrderRow[];
  const items = (i.data ?? []) as OrderItemRow[];
  const jobs = (j.data ?? []) as JobRow[];
  const fin = new Map<string, OrderFinancials>();
  for (const ord of orders) {
    fin.set(
      ord.id,
      orderFinancials({
        status: ord.status,
        total: ord.total,
        estimated_cost: ord.estimated_cost,
        amount_paid: ord.amount_paid,
        items: items.filter((x) => x.order_id === ord.id),
        jobs: jobs.filter((x) => x.order_id === ord.id),
      }),
    );
  }
  return { orders, items, jobs, fin };
}
