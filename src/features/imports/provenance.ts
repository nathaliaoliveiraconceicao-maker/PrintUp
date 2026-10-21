/**
 * Origem dos dados: "arquivo" (lido do arquivo importado) ou "manual" (informado/corrigido pelo usuário).
 * Regra: valor presente exige origem; valor ausente não tem origem. Corrigir um valor do arquivo o torna "manual".
 */
export type Origin = "arquivo" | "manual" | null;
type Scalar = number | string | boolean;

function sameValue(a: Scalar, b: Scalar): boolean {
  return typeof a === "number" && typeof b === "number" ? Math.abs(a - b) < 0.005 : a === b;
}

export function resolveOrigin(original: Scalar | null, originalOrigin: Origin, current: Scalar | null): { origin: Origin; edited: boolean } {
  if (current === null) return { origin: null, edited: original !== null };
  if (original !== null && originalOrigin !== null && sameValue(original, current)) return { origin: originalOrigin, edited: false };
  return { origin: "manual", edited: original !== null };
}

export type ProvenanceTag = "do arquivo" | "informado por você" | "editado" | "em branco";

/** Etiqueta exibida ao lado de cada campo, comparando com o que o ARQUIVO trouxe (null = não veio). */
export function provenanceTag(original: Scalar | null, current: Scalar | null): ProvenanceTag {
  if (current === null) return "em branco";
  if (original === null) return "informado por você";
  return sameValue(original, current) ? "do arquivo" : "editado";
}

/** Etiqueta de um dado já gravado, a partir da origem e de a pessoa ter corrigido o valor lido do arquivo. */
export function storedTag(present: boolean, origin: Origin | undefined, edited: boolean): ProvenanceTag {
  if (!present) return "em branco";
  if (origin === "arquivo") return "do arquivo";
  return edited ? "editado" : "informado por você";
}

/** Campos secundários (sem coluna de origem própria): nome na interface, coluna gravada e nome no payload de edição. */
export const SECONDARY_FIELDS = [
  { key: "pieces", stored: "piece_count", edit: "pieceCount" },
  { key: "printer", stored: "slicer_printer_name", edit: "slicerPrinterName" },
  { key: "material", stored: "filament_type", edit: "filamentType" },
  { key: "support", stored: "support_used", edit: "supportUsed" },
  { key: "waste", stored: "waste_g", edit: "wasteG" },
] as const;
export type SecondaryKey = (typeof SECONDARY_FIELDS)[number]["key"];
export type FieldOrigins = Partial<Record<SecondaryKey, "arquivo" | "manual">>;

export interface StoredProfile {
  weight_g: number | null;
  print_minutes: number | null;
  weight_origin: Origin;
  time_origin: Origin;
  edited_fields: string[];
  field_origins: FieldOrigins | null;
  piece_count: number | null;
  slicer_printer_name: string | null;
  filament_type: string | null;
  support_used: boolean | null;
  waste_g: number | null;
}

export interface ProfileEdit {
  weightG: number | null;
  printMinutes: number | null;
  pieceCount: number | null;
  slicerPrinterName: string | null;
  filamentType: string | null;
  supportUsed: boolean | null;
  wasteG: number | null;
}

/** Aplica uma edição do usuário sobre o perfil gravado, recalculando origens e a lista de campos editados. */
export function applyProfileEdit(existing: StoredProfile, edit: ProfileEdit) {
  const w = resolveOrigin(existing.weight_g, existing.weight_origin, edit.weightG);
  const t = resolveOrigin(existing.print_minutes, existing.time_origin, edit.printMinutes);
  const edited = new Set(existing.edited_fields);
  if (w.edited) edited.add("weight");
  if (t.edited) edited.add("time");

  const origins: FieldOrigins = {};
  for (const f of SECONDARY_FIELDS) {
    const before = existing[f.stored] as Scalar | null;
    const after = edit[f.edit] as Scalar | null;
    const beforeOrigin = (existing.field_origins ?? {})[f.key] ?? (before !== null ? "manual" : null);
    const r = resolveOrigin(before, beforeOrigin, after);
    if (r.origin) origins[f.key] = r.origin;
    if (r.edited && beforeOrigin === "arquivo") edited.add(f.key);
  }
  return {
    weight_g: edit.weightG,
    weight_origin: w.origin,
    print_minutes: edit.printMinutes,
    time_origin: t.origin,
    edited_fields: [...edited].sort(),
    field_origins: origins,
  };
}
