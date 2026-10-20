import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/card";
import { savePrinter } from "@/features/printers/actions";
import { PrinterForm } from "@/features/printers/printer-form";
import type { PrinterRow } from "@/features/printers/schema";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Editar impressora" };

export default async function EditPrinterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("printers").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  return (
    <>
      <PageHeader title="Editar impressora" />
      <PrinterForm printer={data as PrinterRow} action={savePrinter.bind(null, id)} />
    </>
  );
}
