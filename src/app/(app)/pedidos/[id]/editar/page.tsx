import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/card";
import { OrderEditor, type OrderEditorInitial } from "@/features/orders/order-editor";
import { ORDER_COLUMNS, ORDER_ITEM_COLUMNS, type OrderItemRow, type OrderRow } from "@/features/orders/schema";
import { orderIsEditable } from "@/features/orders/status";
import { formatQuoteNumber } from "@/features/quotes/status";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Editar pedido" };

const dec = (n: number) => String(n).replace(".", ",");

export default async function EditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("orders").select(ORDER_COLUMNS).eq("id", id).maybeSingle();
  if (!data) notFound();
  const o = data as OrderRow;
  const [{ data: it }, { count }, products, customers] = await Promise.all([
    supabase.from("order_items").select(ORDER_ITEM_COLUMNS).eq("order_id", id).order("position"),
    supabase.from("production_jobs").select("id", { count: "exact", head: true }).eq("order_id", id).neq("stage", "cancelado"),
    supabase.from("products").select("id, name, description, sale_price").is("archived_at", null).order("name"),
    supabase.from("customers").select("id, name, phone").order("name"),
  ]);
  if (!orderIsEditable(o.status, (count ?? 0) > 0)) redirect(`/pedidos/${id}`);
  const discountType = o.discount_total > 0 ? "valor" : "nenhum";
  const initial: OrderEditorInitial = {
    orderId: o.id,
    customerId: o.customer_id,
    customerName: o.customer_name,
    customerPhone: o.customer_phone ?? "",
    dueDate: o.due_date ?? "",
    paymentMethod: o.payment_method ?? "",
    notes: o.notes ?? "",
    discountType,
    discountValue: discountType === "valor" ? dec(o.discount_total) : "",
    items: ((it ?? []) as OrderItemRow[]).map((i) => ({ kind: i.kind, productId: i.product_id, name: i.name, description: i.description ?? "", quantity: i.quantity, unitPrice: i.unit_price, discountPercent: i.discount_percent })),
  };
  return (
    <>
      <Link href={`/pedidos/${id}`} className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft size={14} /> Pedido {formatQuoteNumber(o.number)}</Link>
      <PageHeader title={`Editar pedido ${formatQuoteNumber(o.number)}`} />
      <OrderEditor products={products.data ?? []} customers={customers.data ?? []} initial={initial} />
    </>
  );
}
