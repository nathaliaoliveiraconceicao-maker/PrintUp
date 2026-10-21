import { PageHeader } from "@/components/ui/card";
import { BusinessForm } from "@/features/business/business-form";
import { DEFAULT_BUSINESS } from "@/features/business/schema";
import { imageUrls } from "@/features/products/image-urls";
import { loadBusiness } from "@/features/quotes/server";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Meu negócio" };

export default async function BusinessPage() {
  const supabase = await createClient();
  const business = await loadBusiness(supabase);
  const urls = await imageUrls(supabase, [business?.logo_path]);
  return (
    <>
      <PageHeader title="Meu negócio" description="Sua identidade nos orçamentos em PDF: logo, nome, contato e cor da marca." />
      <BusinessForm business={business ?? DEFAULT_BUSINESS} logoUrl={urls.get(business?.logo_path ?? "") ?? null} />
    </>
  );
}
