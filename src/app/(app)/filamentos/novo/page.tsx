import { PageHeader } from "@/components/ui/card";
import { saveFilament } from "@/features/filaments/actions";
import { FilamentForm } from "@/features/filaments/filament-form";

export const metadata = { title: "Novo filamento" };

export default function NewFilamentPage() {
  return (
    <>
      <PageHeader title="Novo filamento" />
      <FilamentForm action={saveFilament.bind(null, null)} />
    </>
  );
}
