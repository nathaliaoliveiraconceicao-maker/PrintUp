import { headers } from "next/headers";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/card";
import { ShareForm } from "@/features/catalog-share/share-form";
import type { CatalogShareRow } from "@/features/catalog-share/schema";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Compartilhar catálogo" };

export default async function ShareCatalogPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("catalog_shares").select("token, enabled, title, show_prices, show_out_of_stock").maybeSingle();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return (
    <>
      <Link href="/produtos" className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft size={16} />Meus produtos</Link>
      <PageHeader title="Compartilhar catálogo" description="Um link para o cliente ver o que você tem em estoque e os preços, sem precisar de conta." />
      <ShareForm share={(data as CatalogShareRow | null) ?? null} origin={`${proto}://${host}`} />
    </>
  );
}
