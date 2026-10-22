"use server";

import { revalidatePath } from "next/cache";
import { dbErrorMessage } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { calculateQuote } from "@/features/quotes/calc";
import { saveOrderSchema, paymentSchema, type OrderActionState } from "./schema";
import { canMoveOrder, type OrderStatus } from "./status";

type Db = Awaited<ReturnType<typeof createClient>>;

function refresh(id?: string) {
  revalidatePath("/pedidos");
  revalidatePath("/producao");
  revalidatePath("/filamentos/estoque");
  revalidatePath("/filamentos");
  revalidatePath("/");
  if (id) revalidatePath(`/pedidos/${id}`);
}

async function userId(supabase: Db): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/** Cria ou edita um pedido manual. As contas são refeitas aqui, em centavos; custo e peso vêm do cadastro do produto (no banco). */
export async function saveOrder(payload: unknown): Promise<OrderActionState> {
  const parsed = saveOrderSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const v = parsed.data;
  const supabase = await createClient();
  if (!(await userId(supabase))) return { error: "Sessão expirada. Entre novamente." };

  const totals = calculateQuote(v.items.map((i) => ({ quantity: i.quantity, unitPrice: i.unitPrice, discountPercent: i.discountPercent })), v.discount);
  if (totals.discountCapped) return { error: "O desconto não pode ser maior que o subtotal." };

  const { data, error } = await supabase.rpc("save_order", {
    p_order_id: v.orderId ?? null,
    p_order: {
      customer_id: v.customerId ?? null,
      customer_name: v.customer.name,
      customer_phone: v.customer.phone ?? null,
      due_date: v.dueDate ?? null,
      payment_method: v.paymentMethod ?? null,
      notes: v.notes ?? null,
      subtotal: totals.subtotal,
      discount_total: totals.discountTotal,
      total: totals.total,
    },
    p_items: v.items.map((i, idx) => ({
      kind: i.kind,
      product_id: i.kind === "produto" ? i.productId : null,
      name: i.name,
      description: i.description ?? null,
      quantity: i.quantity,
      unit_price: i.unitPrice,
      discount_percent: i.discountPercent,
      line_total: totals.lineTotals[idx],
    })),
  });
  if (error || !data) return { error: dbErrorMessage(error ?? {}) };
  refresh(data as string);
  return { ok: true, orderId: data as string };
}

/** Converte um orçamento aprovado em pedido. Repetir devolve o pedido que já existe (nunca duplica). */
export async function convertQuoteToOrder(quoteId: string): Promise<OrderActionState> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("convert_quote_to_order", { p_quote: quoteId });
  if (error || !data) return { error: dbErrorMessage(error ?? {}) };
  const r = data as { order_id: string; created: boolean };
  revalidatePath(`/orcamentos/${quoteId}`);
  refresh(r.order_id);
  return { ok: true, orderId: r.order_id, message: r.created ? "Pedido criado a partir do orçamento." : "Este orçamento já virou pedido." };
}

export async function setOrderStatus(orderId: string, to: OrderStatus): Promise<OrderActionState> {
  const supabase = await createClient();
  const { data: cur } = await supabase.from("orders").select("status").eq("id", orderId).maybeSingle();
  if (!cur) return { error: "Pedido não encontrado." };
  if (!canMoveOrder(cur.status as OrderStatus, to)) return { error: "Essa mudança de status não é permitida." };
  const { error } = await supabase.from("orders").update({ status: to }).eq("id", orderId);
  if (error) return { error: dbErrorMessage(error) };
  refresh(orderId);
  return { ok: true, orderId };
}

/** Atualiza prazo, forma de pagamento e observações (valem em qualquer fase, menos cancelado). */
export async function updateOrderDetails(orderId: string, d: { dueDate: string | null; paymentMethod: string | null; notes: string }): Promise<OrderActionState> {
  if (d.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(d.dueDate)) return { error: "Data inválida." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("orders")
    .update({ due_date: d.dueDate || null, payment_method: d.paymentMethod || null, notes: d.notes.trim().slice(0, 2000) || null })
    .eq("id", orderId);
  if (error) return { error: dbErrorMessage(error) };
  refresh(orderId);
  return { ok: true, orderId };
}

/** Cancela o pedido e libera o filamento reservado. O que já foi consumido continua consumido. */
export async function cancelOrder(orderId: string): Promise<OrderActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_order", { p_order: orderId });
  if (error) return { error: dbErrorMessage(error) };
  refresh(orderId);
  return { ok: true, orderId };
}

export async function deleteOrder(orderId: string): Promise<OrderActionState> {
  const supabase = await createClient();
  const { error } = await supabase.from("orders").delete().eq("id", orderId);
  if (error) return { error: dbErrorMessage(error) };
  refresh();
  return { ok: true };
}

/** Lança um recebimento (ou estorno). A receita recebida é a soma destes lançamentos. */
export async function recordPayment(payload: unknown): Promise<OrderActionState> {
  const parsed = paymentSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("order_payments").insert({
    order_id: v.orderId,
    kind: v.kind,
    amount: v.amount,
    method: v.method ?? null,
    paid_at: v.paidAt,
    note: v.note ?? null,
  });
  if (error) return { error: dbErrorMessage(error) };
  refresh(v.orderId);
  return { ok: true, orderId: v.orderId };
}
