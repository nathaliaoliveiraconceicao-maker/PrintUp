import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/card";
import { saveProduct } from "@/features/products/catalog-actions";
import { ProductForm } from "@/features/products/product-form";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Novo produto" };

export default async function NewProductPage() {
  const supabase = await createClient();
  const [printers, filaments, cats] = await Promise.all([
    supabase.from("printers").select("id, name").order("name"),
    supabase.from("filaments").select("id, name, material, color").order("name"),
    supabase.from("products").select("category"),
  ]);
  const categories = [...new Set((cats.data ?? []).map((c) => c.category as string | null).filter((c): c is string => !!c))];
  return (
    <>
      <Link href="/produtos" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft size={14} /> Meus produtos</Link>
      <PageHeader title="Novo produto" description="Cadastro manual. Para calcular o preço a partir dos seus custos, use a calculadora e salve como produto." />
      <p className="mb-4 text-sm text-muted">A foto é adicionada depois de salvar, na edição do produto.</p>
      <ProductForm printers={printers.data ?? []} filaments={filaments.data ?? []} categories={categories} action={saveProduct.bind(null, null)} />
    </>
  );
}
