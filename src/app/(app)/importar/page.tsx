import Link from "next/link";
import { Box } from "lucide-react";
import { Card, PageHeader } from "@/components/ui/card";
import { ImportWizard } from "@/features/imports/import-wizard";
import { signedUrls } from "@/features/imports/storage";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Importar modelo" };

type ModelRow = { id: string; title: string; source: string; file_kind: string | null; thumb_path: string | null; plate_count: number | null; created_at: string };

export default async function ImportPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [printers, models, profiles] = await Promise.all([
    supabase.from("printers").select("id, name, brand, model").eq("is_active", true).order("name"),
    supabase.from("imported_models").select("id, title, source, file_kind, thumb_path, plate_count, created_at").order("created_at", { ascending: false }).limit(30),
    supabase.from("print_profiles").select("model_id, weight_g, print_minutes"),
  ]);
  const rows = (models.data ?? []) as ModelRow[];
  const thumbs = await signedUrls(supabase, rows.map((m) => m.thumb_path));
  const countBy = new Map<string, number>();
  for (const p of (profiles.data ?? []) as { model_id: string }[]) countBy.set(p.model_id, (countBy.get(p.model_id) ?? 0) + 1);

  return (
    <>
      <PageHeader
        title="Importar modelo"
        description="Traga peso e tempo de um arquivo fatiado, calcule o preço e salve o produto, sem digitar tudo de novo."
      />
      <ImportWizard userId={user!.id} printers={(printers.data ?? []) as { id: string; name: string; brand: string | null; model: string | null }[]} />

      <h2 className="mb-3 mt-10 text-lg font-semibold">Modelos importados</h2>
      {rows.length === 0 ? (
        <Card className="text-center text-sm text-muted">Nenhum modelo ainda. Importe um arquivo ou informe os dados manualmente.</Card>
      ) : (
        <ul className="space-y-3">
          {rows.map((m) => (
            <li key={m.id}>
              <Link href={`/importar/${m.id}`} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 hover:border-accent">
                {thumbs.get(m.thumb_path ?? "") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumbs.get(m.thumb_path ?? "")} alt="" className="h-14 w-14 shrink-0 rounded-lg border border-line bg-paper object-contain" />
                ) : (
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-dashed border-line text-muted"><Box size={20} /></span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{m.title}</span>
                  <span className="num block text-sm text-muted">
                    {m.source === "manual" ? "Manual" : m.file_kind === "3mf" ? "3MF" : m.file_kind === "gcode" ? "G-code" : "Arquivo"} · {countBy.get(m.id) ?? 0} perfil(is) · {formatDateTime(m.created_at)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
