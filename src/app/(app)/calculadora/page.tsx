import Link from "next/link";
import { Card, PageHeader } from "@/components/ui/card";
import { Calculator } from "@/features/calculator/calculator";
import type { FilamentRow } from "@/features/filaments/schema";
import type { PrinterRow } from "@/features/printers/schema";
import { DEFAULT_SETTINGS, type SettingsRow } from "@/features/settings/schema";
import type { CalcProfile } from "@/features/calculator/profile";
import { signedUrls } from "@/features/imports/storage";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const metadata = { title: "Calculadora" };

export default async function CalculatorPage({ searchParams }: { searchParams: Promise<{ perfil?: string; impressora?: string }> }) {
  const { perfil, impressora } = await searchParams;
  const supabase = await createClient();
  const [printers, filaments, settings, products] = await Promise.all([
    supabase.from("printers").select("*").eq("is_active", true).order("name"),
    supabase.from("filaments").select("*").eq("is_active", true).order("name"),
    supabase.from("cost_settings").select("*").maybeSingle(),
    supabase.from("products").select("id, name").order("name"),
  ]);

  // Perfil de impressão (importado ou manual) que pré-preenche tempo, peso e material.
  let profile: CalcProfile | null = null;
  if (perfil && UUID.test(perfil)) {
    const { data: p } = await supabase.from("print_profiles").select("*").eq("id", perfil).maybeSingle();
    if (p) {
      const { data: m } = await supabase.from("imported_models").select("id, title, thumb_path").eq("id", p.model_id).maybeSingle();
      const urls = await signedUrls(supabase, [m?.thumb_path as string | null]);
      profile = {
        id: p.id as string,
        name: p.name as string,
        modelId: p.model_id as string,
        modelTitle: (m?.title as string | undefined) ?? "Modelo",
        slicerPrinterName: p.slicer_printer_name as string | null,
        filamentType: p.filament_type as string | null,
        weightG: p.weight_g as number | null,
        printMinutes: p.print_minutes as number | null,
        weightOrigin: p.weight_origin as CalcProfile["weightOrigin"],
        timeOrigin: p.time_origin as CalcProfile["timeOrigin"],
        editedFields: (p.edited_fields as string[] | null) ?? [],
        pieceCount: p.piece_count as number | null,
        supportUsed: p.support_used as boolean | null,
        wasteG: p.waste_g as number | null,
        thumbUrl: urls.get((m?.thumb_path as string | undefined) ?? "") ?? null,
      };
    }
  }

  return (
    <>
      <PageHeader title="Calculadora" description="Custo e preço de venda, atualizados enquanto você digita." />
      {(printers.data?.length ?? 0) === 0 && (
        <Card className="mb-6 bg-accent-soft text-sm">
          Para usar o custo real da máquina, <Link className="font-medium underline" href="/impressoras/nova">cadastre uma impressora</Link>.
          Sem ela, o cálculo considera apenas material, mão de obra e demais custos.
        </Card>
      )}
      <Calculator
        printers={(printers.data ?? []) as PrinterRow[]}
        filaments={(filaments.data ?? []) as FilamentRow[]}
        settings={(settings.data as SettingsRow | null) ?? DEFAULT_SETTINGS}
        products={(products.data ?? []) as { id: string; name: string }[]}
        profile={profile}
        initialPrinterId={impressora && UUID.test(impressora) ? impressora : undefined}
        key={profile?.id ?? "livre"}
      />
    </>
  );
}
