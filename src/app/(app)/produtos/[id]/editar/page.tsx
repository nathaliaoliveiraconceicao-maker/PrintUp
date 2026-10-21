import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card, PageHeader } from "@/components/ui/card";
import { saveProduct, setProductPhoto } from "@/features/products/catalog-actions";
import { CATALOG_COLUMNS, type CatalogProduct } from "@/features/products/catalog-schema";
import { imageUrls } from "@/features/products/image-urls";
import { ProductForm } from "@/features/products/product-form";
import { ProductPhoto } from "@/features/products/product-photo";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Editar produto" };

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("products").select(CATALOG_COLUMNS).eq("id", id).maybeSingle();
  if (!data) notFound();
  const product = data as CatalogProduct;
  const [printers, filaments, cats, photos] = await Promise.all([
    supabase.from("printers").select("id, name").order("name"),
    supabase.from("filaments").select("id, name, material, color").order("name"),
    supabase.from("products").select("category"),
    imageUrls(supabase, [product.photo_path]),
  ]);
  const categories = [...new Set((cats.data ?? []).map((c) => c.category as string | null).filter((c): c is string => !!c))];
  return (
    <>
      <Link href={`/produtos/${id}`} className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft size={14} /> {product.name}</Link>
      <PageHeader title="Editar produto" />
      <Card className="mb-6">
        <h2 className="mb-3 font-semibold">Foto</h2>
        <ProductPhoto productId={id} currentUrl={photos.get(product.photo_path ?? "") ?? null} setPhoto={setProductPhoto} />
      </Card>
      <ProductForm product={product} printers={printers.data ?? []} filaments={filaments.data ?? []} categories={categories} action={saveProduct.bind(null, id)} />
    </>
  );
}
