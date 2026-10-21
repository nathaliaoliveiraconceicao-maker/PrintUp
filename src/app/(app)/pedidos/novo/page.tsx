import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/card";
import { OrderEditor } from "@/features/orders/order-editor";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Novo pedido" };

export default async function NewOrderPage() {
  const supabase = await createClient();
  const [products, customers] = await Promise.all([
    supabase.from("products").select("id, name, description, sale_price").is("archived_at", null).order("name"),
    supabase.from("customers").select("id, name, phone").order("name"),
  ]);
  return (
    <>
      <Link href="/pedidos" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft size={14} /> Pedidos</Link>
      <PageHeader title="Novo pedido" description="Cadastro manual. Para pedidos que vêm de um orçamento aprovado, use “Transformar em pedido” no orçamento." />
      <OrderEditor products={products.data ?? []} customers={customers.data ?? []} />
    </>
  );
}
