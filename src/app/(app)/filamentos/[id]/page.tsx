import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/card";
import { saveFilament } from "@/features/filaments/actions";
import { FilamentForm } from "@/features/filaments/filament-form";
import type { FilamentRow } from "@/features/filaments/schema";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Editar filamento" };

export default async function EditFilamentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("filaments").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  return (
    <>
      <PageHeader title="Editar filamento" />
      <FilamentForm filament={data as FilamentRow} action={saveFilament.bind(null, id)} />
    </>
  );
}
