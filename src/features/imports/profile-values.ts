import { parseDecimal } from "@/lib/utils";
import type { ProfileDraft } from "./drafts";
import { resolveOrigin, type FieldOrigins, type Origin } from "./provenance";
import type { ParsedMaterial } from "./types";

/** Estado dos campos da ficha (texto digitado, como o usuário vê). */
export interface ProfileValues {
  name: string;
  pieceCount: string;
  slicerPrinterName: string;
  filamentType: string;
  weightG: string;
  hours: string;
  minutes: string;
  support: "" | "sim" | "nao";
  wasteG: string;
}

/** Dados que o usuário não edita, mas que acompanham o perfil. */
export interface ProfileMeta {
  plateIndex: number | null;
  printerModelCode: string | null;
  nozzleMm: number | null;
  layerHeightMm: number | null;
  materials: ParsedMaterial[] | null;
  rawMeta: Record<string, string> | null;
}

/** O que o arquivo trouxe (null = não veio). Base para as etiquetas "do arquivo" / "editado". */
export interface ProfileOriginal {
  weightG: number | null;
  printMinutes: number | null;
  weightOrigin: Origin;
  timeOrigin: Origin;
  pieceCount: number | null;
  slicerPrinterName: string | null;
  filamentType: string | null;
  supportUsed: boolean | null;
  wasteG: number | null;
}

const fmt = (n: number | null) => (n === null ? "" : String(n).replace(".", ","));

export function emptyValues(name = "Perfil 1"): ProfileValues {
  return { name, pieceCount: "", slicerPrinterName: "", filamentType: "", weightG: "", hours: "", minutes: "", support: "", wasteG: "" };
}

export function valuesFromMinutes(minutes: number | null): Pick<ProfileValues, "hours" | "minutes"> {
  if (minutes === null) return { hours: "", minutes: "" };
  const h = Math.floor(minutes / 60);
  const m = Math.round((minutes - h * 60) * 100) / 100;
  return { hours: h > 0 ? String(h) : "", minutes: m > 0 || h === 0 ? fmt(m) : "" };
}

export function valuesFromDraft(d: ProfileDraft, printerName: string | null): ProfileValues {
  return {
    name: d.name,
    pieceCount: d.pieceCount === null ? "" : String(d.pieceCount),
    slicerPrinterName: printerName ?? "",
    filamentType: d.filamentType ?? "",
    weightG: fmt(d.weightG),
    ...valuesFromMinutes(d.printMinutes),
    support: d.supportUsed === null ? "" : d.supportUsed ? "sim" : "nao",
    wasteG: fmt(d.wasteG),
  };
}

export function originalFromDraft(d: ProfileDraft, printerName: string | null): ProfileOriginal {
  return {
    weightG: d.weightG,
    printMinutes: d.printMinutes,
    weightOrigin: d.weightG !== null ? "arquivo" : null,
    timeOrigin: d.printMinutes !== null ? "arquivo" : null,
    pieceCount: d.pieceCount,
    slicerPrinterName: printerName,
    filamentType: d.filamentType,
    supportUsed: d.supportUsed,
    wasteG: d.wasteG,
  };
}

export const NO_ORIGINAL: ProfileOriginal = {
  weightG: null, printMinutes: null, weightOrigin: null, timeOrigin: null, pieceCount: null,
  slicerPrinterName: null, filamentType: null, supportUsed: null, wasteG: null,
};

/** Campo numérico opcional: vazio => null; inválido ou negativo => NaN. */
function optionalNumber(s: string): number | null {
  if (s.trim() === "") return null;
  const n = parseDecimal(s);
  return Number.isNaN(n) || n < 0 ? NaN : n;
}

export function minutesFromValues(v: Pick<ProfileValues, "hours" | "minutes">): number | null {
  const h = optionalNumber(v.hours);
  const m = optionalNumber(v.minutes);
  if (Number.isNaN(h) || Number.isNaN(m)) return NaN;
  if (h === null && m === null) return null;
  const total = (h ?? 0) * 60 + (m ?? 0);
  return total > 0 ? Math.round(total * 100) / 100 : null;
}

export interface ProfileInputPayload {
  name: string;
  plateIndex: number | null;
  pieceCount: number | null;
  slicerPrinterName: string | null;
  printerModelCode: string | null;
  nozzleMm: number | null;
  layerHeightMm: number | null;
  filamentType: string | null;
  materials: ParsedMaterial[] | null;
  weightG: number | null;
  printMinutes: number | null;
  supportUsed: boolean | null;
  wasteG: number | null;
  weightOrigin: Origin;
  timeOrigin: Origin;
  editedFields: string[];
  fieldOrigins: FieldOrigins;
  rawMeta: Record<string, string> | null;
}

/** Converte os campos digitados em payload tipado, calculando a ORIGEM de cada dado em relação ao arquivo. */
export function toProfileInput(
  v: ProfileValues,
  meta: ProfileMeta,
  original: ProfileOriginal,
): { ok: true; input: ProfileInputPayload } | { ok: false; errors: Partial<Record<keyof ProfileValues, string>> } {
  const errors: Partial<Record<keyof ProfileValues, string>> = {};
  const weightG = optionalNumber(v.weightG);
  const wasteG = optionalNumber(v.wasteG);
  const pieces = optionalNumber(v.pieceCount);
  const printMinutes = minutesFromValues(v);
  if (!v.name.trim()) errors.name = "Dê um nome ao perfil.";
  if (Number.isNaN(weightG)) errors.weightG = "Informe um número válido.";
  else if (weightG === 0) errors.weightG = "O peso precisa ser maior que zero (ou deixe em branco).";
  if (Number.isNaN(wasteG)) errors.wasteG = "Informe um número válido.";
  if (Number.isNaN(pieces) || (pieces !== null && (!Number.isInteger(pieces) || pieces < 1))) errors.pieceCount = "Use um número inteiro a partir de 1.";
  if (Number.isNaN(printMinutes)) errors.minutes = "Informe um tempo válido.";
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const w = resolveOrigin(original.weightG, original.weightOrigin, weightG);
  const t = resolveOrigin(original.printMinutes, original.timeOrigin, printMinutes);
  const supportUsed = v.support === "" ? null : v.support === "sim";
  const printer = v.slicerPrinterName.trim() || null;
  const material = v.filamentType.trim() || null;

  const edited: string[] = [];
  if (w.edited) edited.push("weight");
  if (t.edited) edited.push("time");
  const fieldOrigins: FieldOrigins = {};
  const secondary = [
    ["pieces", original.pieceCount, pieces],
    ["printer", original.slicerPrinterName, printer],
    ["material", original.filamentType, material],
    ["support", original.supportUsed, supportUsed],
    ["waste", original.wasteG, wasteG],
  ] as const;
  for (const [key, before, after] of secondary) {
    const r = resolveOrigin(before, before !== null ? "arquivo" : null, after);
    if (r.origin) fieldOrigins[key] = r.origin;
    if (r.edited) edited.push(key);
  }

  return {
    ok: true,
    input: {
      name: v.name.trim(),
      plateIndex: meta.plateIndex,
      pieceCount: pieces,
      slicerPrinterName: printer,
      printerModelCode: meta.printerModelCode,
      nozzleMm: meta.nozzleMm,
      layerHeightMm: meta.layerHeightMm,
      filamentType: material,
      materials: meta.materials,
      weightG,
      printMinutes,
      supportUsed,
      wasteG,
      weightOrigin: w.origin,
      timeOrigin: t.origin,
      editedFields: edited.sort(),
      fieldOrigins,
      rawMeta: meta.rawMeta,
    },
  };
}
