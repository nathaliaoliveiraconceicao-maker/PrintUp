import { PageHeader } from "@/components/ui/card";
import { LinkImportForm } from "@/features/imports/link-import-form";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Guardar link de um modelo" };

export default async function LinkImportPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("printers").select("id, name").eq("is_active", true).order("name");
  return (
    <>
      <PageHeader title="Guardar o link de um modelo" description="Cole o link de qualquer site. O PrintUp guarda o endereço como referência e você informa peso e tempo." />
      <LinkImportForm printers={(data ?? []) as { id: string; name: string }[]} />
    </>
  );
}
