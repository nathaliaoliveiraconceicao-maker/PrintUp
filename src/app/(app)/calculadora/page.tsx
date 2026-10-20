import Link from "next/link";
import { Card, PageHeader } from "@/components/ui/card";
import { Calculator } from "@/features/calculator/calculator";
import type { FilamentRow } from "@/features/filaments/schema";
import type { PrinterRow } from "@/features/printers/schema";
import { DEFAULT_SETTINGS, type SettingsRow } from "@/features/settings/schema";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Calculadora" };

export default async function CalculatorPage() {
  const supabase = await createClient();
  const [printers, filaments, settings] = await Promise.all([
    supabase.from("printers").select("*").eq("is_active", true).order("name"),
    supabase.from("filaments").select("*").eq("is_active", true).order("name"),
    supabase.from("cost_settings").select("*").maybeSingle(),
  ]);

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
      />
    </>
  );
}
