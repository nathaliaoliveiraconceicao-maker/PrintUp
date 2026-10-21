import type { ParsedMaterial, ParsedModel } from "./types";

/** Rascunho de perfil de impressão (uma placa), pronto para a ficha editável. */
export interface ProfileDraft {
  key: string;
  name: string;
  plateIndex: number | null;
  pieceCount: number | null;
  materials: ParsedMaterial[];
  filamentType: string | null;
  weightG: number | null;
  printMinutes: number | null;
  supportUsed: boolean | null;
  wasteG: number | null;
}

export function summarizeMaterials(materials: ParsedMaterial[]): string | null {
  const types = [...new Set(materials.map((m) => m.type).filter((t): t is string => !!t))];
  return types.length > 0 ? types.join(" + ") : null;
}

export function defaultTitle(model: ParsedModel, fileName: string): string {
  return model.title ?? (fileName.replace(/\.(gcode\.3mf|3mf|gcode|gco)$/i, "").replace(/[_]+/g, " ").trim() || "Modelo importado");
}

/** Uma entrada por placa lida. Sem placas (ex.: 3MF só com geometria) => um perfil vazio, para preencher à mão. */
export function buildDrafts(model: ParsedModel): ProfileDraft[] {
  if (model.plates.length === 0) {
    return [
      { key: "p1", name: "Perfil 1", plateIndex: null, pieceCount: null, materials: [], filamentType: null, weightG: null, printMinutes: null, supportUsed: null, wasteG: null },
    ];
  }
  return model.plates.map((p, i) => ({
    key: `p${i + 1}`,
    name: p.name ?? (p.index !== null ? `Placa ${p.index}` : model.kind === "gcode" ? "G-code" : `Placa ${i + 1}`),
    plateIndex: p.index,
    pieceCount: p.pieceCount,
    materials: p.materials,
    filamentType: summarizeMaterials(p.materials),
    weightG: p.weightG,
    printMinutes: p.printMinutes,
    supportUsed: p.supportUsed,
    wasteG: p.wasteG,
  }));
}
