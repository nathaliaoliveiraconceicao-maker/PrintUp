import { PageHeader } from "@/components/ui/card";
import { ManualImportForm } from "@/features/imports/manual-import-form";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Informar dados manualmente" };

export default async function ManualImportPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("printers").select("id, name").eq("is_active", true).order("name");
  return (
    <>
      <PageHeader title="Informar manualmente" description="Digite os dados da impressão. Tudo fica registrado como “informado por você”." />
      <ManualImportForm printers={(data ?? []) as { id: string; name: string }[]} />
    </>
  );
}
