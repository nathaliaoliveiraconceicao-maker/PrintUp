import { PageHeader } from "@/components/ui/card";
import { savePrinter } from "@/features/printers/actions";
import { PrinterForm } from "@/features/printers/printer-form";

export const metadata = { title: "Nova impressora" };

export default function NewPrinterPage() {
  return (
    <>
      <PageHeader title="Nova impressora" />
      <PrinterForm action={savePrinter.bind(null, null)} />
    </>
  );
}
