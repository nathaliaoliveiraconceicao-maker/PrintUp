import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Box, Download, Info } from "lucide-react";
import { DeleteButton } from "@/components/delete-button";
import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";
import { addProfile, deleteModel } from "@/features/imports/actions";
import { splitNotes } from "@/features/imports/notes";
import { SyntheticBanner } from "@/features/imports/synthetic-banner";
import { ProfileEditor, type StoredProfileView } from "@/features/imports/profile-editor";
import { signedUrls } from "@/features/imports/storage";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Modelo importado" };

type ModelRow = {
  id: string; title: string; designer: string | null; source: string; slicer_label: string | null; plate_count: number | null;
  parse_notes: string[]; file_path: string | null; file_name: string | null; file_size: number | null; file_kind: string | null;
  thumb_path: string | null; created_at: string; source_url: string | null;
};

export default async function ModelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("imported_models").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const model = data as ModelRow;
  const [profiles, printers] = await Promise.all([
    supabase.from("print_profiles").select("*").eq("model_id", id).order("plate_index", { ascending: true, nullsFirst: false }).order("created_at"),
    supabase.from("printers").select("name, brand, model").eq("is_active", true).order("name").limit(1),
  ]);
  const list = (profiles.data ?? []) as (StoredProfileView & { id: string })[];
  const notes = splitNotes(model.parse_notes);
  const urls = await signedUrls(supabase, [model.thumb_path, model.file_path]);
  const thumb = urls.get(model.thumb_path ?? "");
  const download = urls.get(model.file_path ?? "");
  const printer = ((printers.data ?? []) as { name: string; brand: string | null; model: string | null }[])[0] ?? null;

  async function remove() {
    "use server";
    await deleteModel(id);
    redirect("/importar");
  }
  async function add() {
    "use server";
    await addProfile(id);
  }

  return (
    <>
      <Link href="/importar" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft size={14} /> Importar modelo
      </Link>
      <PageHeader title={model.title} action={<DeleteButton what={model.title} action={remove} />} />

      <Card className="mb-6 flex gap-4">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="Prévia do modelo" className="h-28 w-28 shrink-0 rounded-xl border border-line bg-paper object-contain" />
        ) : (
          <span className="flex h-28 w-28 shrink-0 items-center justify-center rounded-xl border border-dashed border-line text-muted"><Box /></span>
        )}
        <div className="min-w-0 space-y-1 text-sm">
          <p><strong>Origem dos dados:</strong> {model.source === "manual" ? "informados manualmente" : model.source === "link" ? "informados por você (modelo de um link)" : `arquivo ${model.file_kind === "3mf" ? "3MF" : "G-code"}`}{model.slicer_label ? ` · ${model.slicer_label}` : ""}</p>
          {model.source === "link" && model.source_url && /^https?:\/\//i.test(model.source_url) && <p className="break-all"><strong>Link:</strong> <a href={model.source_url} target="_blank" rel="noopener noreferrer" className="font-medium text-accent-strong underline">{model.source_url}</a></p>}
          {model.designer && <p><strong>Autor:</strong> {model.designer}</p>}
          {model.plate_count && <p><strong>Placas no projeto:</strong> {model.plate_count}</p>}
          <p className="num text-muted">Importado em {formatDateTime(model.created_at)}</p>
          {model.file_path ? (
            <p className="flex flex-wrap items-center gap-2">
              <span className="text-muted">Arquivo guardado: {model.file_name} ({((model.file_size ?? 0) / 1048576).toFixed(1).replace(".", ",")} MB)</span>
              {download && <a href={download} download className="inline-flex items-center gap-1 font-medium text-accent-strong underline"><Download size={14} />Baixar</a>}
            </p>
          ) : (
            model.source === "arquivo" && <p className="text-muted">O arquivo original não foi guardado (só os dados).</p>
          )}
        </div>
      </Card>

      {notes.synthetic && <div className="mb-6"><SyntheticBanner /></div>}

      {notes.rest.length > 0 && (
        <Card className="mb-6 space-y-2 border-import/30 bg-import-soft/40">
          <p className="flex items-center gap-2 text-sm font-semibold text-import"><Info size={16} /> O que não foi encontrado no arquivo</p>
          <ul className="list-disc space-y-1 pl-5 text-sm">{notes.rest.map((n) => <li key={n}>{n}</li>)}</ul>
        </Card>
      )}

      <h2 className="mb-3 text-lg font-semibold">Perfis de impressão</h2>
      <div className="space-y-4">
        {list.map((p) => (
          <ProfileEditor key={p.id} profile={p} modelId={id} canDelete={list.length > 1} printer={printer} />
        ))}
      </div>
      <form action={add} className="mt-4">
        <Button variant="secondary" type="submit">Adicionar outro perfil</Button>
      </form>
    </>
  );
}
