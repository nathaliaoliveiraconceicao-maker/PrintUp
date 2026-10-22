"use server";

import { logEvent } from "@/features/admin/log";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dbErrorMessage } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { MAX_FILE_BYTES } from "./limits";
import { BUCKET, isValidFilePath, isValidThumbPath } from "./paths";
import { applyProfileEdit, type StoredProfile } from "./provenance";
import { friendlyImportIssue, issuePath, normalizeImportPayload, profileEditSchema, saveImportSchema, type ProfileInput, type SaveImportState } from "./schema";

const MAX_THUMB_BYTES = 2 * 1024 * 1024;

export type SimpleState = { ok?: true; error?: string };

/** Tamanho real gravado pelo Storage (ou null se o objeto não existe). */
async function objectSize(supabase: SupabaseClient, path: string): Promise<number | null> {
  const slash = path.lastIndexOf("/");
  const { data } = await supabase.storage.from(BUCKET).list(path.slice(0, slash), { search: path.slice(slash + 1), limit: 10 });
  const hit = data?.find((o) => o.name === path.slice(slash + 1));
  const size = (hit?.metadata as { size?: unknown } | undefined)?.size;
  return typeof size === "number" ? size : null;
}

const profileRow = (modelId: string, p: ProfileInput) => ({
  model_id: modelId,
  name: p.name,
  plate_index: p.plateIndex,
  piece_count: p.pieceCount,
  slicer_printer_name: p.slicerPrinterName,
  printer_model_code: p.printerModelCode,
  nozzle_mm: p.nozzleMm,
  layer_height_mm: p.layerHeightMm,
  filament_type: p.filamentType,
  materials: p.materials,
  weight_g: p.weightG,
  print_minutes: p.printMinutes,
  support_used: p.supportUsed,
  waste_g: p.wasteG,
  weight_origin: p.weightOrigin,
  time_origin: p.timeOrigin,
  edited_fields: p.editedFields,
  field_origins: p.fieldOrigins,
  raw_meta: p.rawMeta,
});

/**
 * Grava o modelo e seus perfis. Os arquivos (miniatura e, opcionalmente, o original) já foram enviados pelo navegador
 * direto ao Storage; aqui conferimos que existem, que são do usuário e que respeitam os limites. Falhou => limpa tudo.
 */
export async function saveImport(payload: unknown): Promise<SaveImportState> {
  const parsed = saveImportSchema.safeParse(normalizeImportPayload(payload));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    // Só o caminho do campo (nunca valores): ajuda a achar arquivos que o leitor não trata bem.
    await logEvent("importacao", "aviso", "Importação recusada por dado inválido", { campo: issue ? issuePath(issue) : "desconhecido", tipo: issue?.code ?? "desconhecido" });
    return { error: issue ? friendlyImportIssue(issue) : "Dados inválidos." };
  }
  const v = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada. Entre novamente." };

  if ((v.filePath && !isValidFilePath(user.id, v.filePath)) || (v.thumbPath && !isValidThumbPath(user.id, v.thumbPath))) {
    return { error: "Caminho de arquivo inválido." };
  }
  if (v.source === "manual" && (v.filePath || v.thumbPath)) return { error: "Entrada manual não leva arquivos." };

  const uploaded = [v.filePath, v.thumbPath].filter((p): p is string => !!p);
  const cleanup = async () => {
    if (uploaded.length > 0) await supabase.storage.from(BUCKET).remove(uploaded);
  };

  let fileSize: number | null = null;
  if (v.filePath) {
    fileSize = await objectSize(supabase, v.filePath);
    if (fileSize === null || fileSize > MAX_FILE_BYTES) {
      await cleanup();
      return { error: fileSize === null ? "O arquivo não foi enviado. Tente novamente." : "O arquivo excede o limite de tamanho." };
    }
  }
  if (v.thumbPath) {
    const size = await objectSize(supabase, v.thumbPath);
    if (size === null || size > MAX_THUMB_BYTES) {
      await cleanup();
      return { error: "A miniatura não foi enviada corretamente. Tente novamente." };
    }
  }

  const { data: model, error } = await supabase
    .from("imported_models")
    .insert({
      title: v.title,
      designer: v.designer,
      source: v.source,
      slicer_label: v.slicerLabel,
      plate_count: v.plateCount,
      parse_notes: v.parseNotes,
      file_path: v.filePath,
      file_name: v.fileName,
      file_size: fileSize,
      file_kind: v.fileKind,
      thumb_path: v.thumbPath,
    })
    .select("id")
    .single();
  if (error || !model) {
    await cleanup();
    await logEvent("importacao", error?.code === "P0001" ? "aviso" : "erro", error?.code === "P0001" ? "Importação recusada por limite/recurso do plano" : "Falha ao salvar modelo importado", { code: error?.code ?? "desconhecido" }, user.id);
    return { error: dbErrorMessage(error ?? {}) };
  }

  const { data: profiles, error: profileError } = await supabase
    .from("print_profiles")
    .insert(v.profiles.map((p) => profileRow(model.id as string, p)))
    .select("id");
  if (profileError || !profiles) {
    await supabase.from("imported_models").delete().eq("id", model.id);
    await cleanup();
    await logEvent("importacao", "erro", "Falha ao salvar os perfis do modelo importado", { code: profileError?.code ?? "desconhecido" }, user.id);
    return { error: dbErrorMessage(profileError ?? {}) };
  }

  revalidatePath("/importar");
  revalidatePath("/");
  return { ok: true, modelId: model.id as string, profileIds: profiles.map((p) => p.id as string) };
}

/** Edita um perfil salvo. As ORIGENS dos dados são recalculadas aqui, em relação ao que estava gravado. */
export async function updateProfile(profileId: string, payload: unknown): Promise<SimpleState> {
  const parsed = profileEditSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const edit = parsed.data;

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("print_profiles")
    .select("model_id, weight_g, print_minutes, weight_origin, time_origin, edited_fields, field_origins, piece_count, slicer_printer_name, filament_type, support_used, waste_g")
    .eq("id", profileId)
    .maybeSingle();
  if (!row) return { error: "Perfil não encontrado." };

  const computed = applyProfileEdit(row as unknown as StoredProfile, edit);
  const { error } = await supabase
    .from("print_profiles")
    .update({
      name: edit.name,
      piece_count: edit.pieceCount,
      slicer_printer_name: edit.slicerPrinterName,
      filament_type: edit.filamentType,
      support_used: edit.supportUsed,
      waste_g: edit.wasteG,
      ...computed,
    })
    .eq("id", profileId);
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath(`/importar/${row.model_id}`);
  return { ok: true };
}

export async function addProfile(modelId: string): Promise<SimpleState> {
  const supabase = await createClient();
  const { count } = await supabase.from("print_profiles").select("id", { count: "exact", head: true }).eq("model_id", modelId);
  if (count !== null && count >= 100) return { error: "Limite de perfis por modelo atingido." };
  const { error } = await supabase.from("print_profiles").insert({ model_id: modelId, name: `Perfil ${(count ?? 0) + 1}` });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath(`/importar/${modelId}`);
  return { ok: true };
}

export async function deleteProfile(profileId: string, modelId: string): Promise<SimpleState> {
  const supabase = await createClient();
  const { count } = await supabase.from("print_profiles").select("id", { count: "exact", head: true }).eq("model_id", modelId);
  if ((count ?? 0) <= 1) return { error: "O modelo precisa ter ao menos um perfil. Para removê-lo, exclua o modelo." };
  const { error } = await supabase.from("print_profiles").delete().eq("id", profileId);
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath(`/importar/${modelId}`);
  return { ok: true };
}

/** Exclui o modelo e os arquivos dele no Storage (arquivo original e miniatura). Produtos e preços salvos permanecem. */
export async function deleteModel(modelId: string): Promise<SimpleState> {
  const supabase = await createClient();
  const { data: model } = await supabase.from("imported_models").select("file_path, thumb_path").eq("id", modelId).maybeSingle();
  if (!model) return { ok: true };
  const paths = [model.file_path, model.thumb_path].filter((p): p is string => !!p);
  if (paths.length > 0) await supabase.storage.from(BUCKET).remove(paths);
  const { error } = await supabase.from("imported_models").delete().eq("id", modelId);
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath("/importar");
  revalidatePath("/produtos");
  return { ok: true };
}
