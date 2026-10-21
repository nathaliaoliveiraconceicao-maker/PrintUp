import { MAX_FILE_BYTES } from "./limits";
import type { RejectCode } from "./types";

export type FileKind = "3mf" | "gcode";
export type FileCheck = { ok: true; kind: FileKind } | { ok: false; code: RejectCode; message: string };

const MB = 1024 * 1024;

/** Valida nome (extensão) e tamanho ANTES de ler qualquer byte. O tipo real é conferido depois pelo conteúdo. */
export function validateFileMeta(name: string, size: number): FileCheck {
  const ext = /\.([A-Za-z0-9]+)$/.exec(name)?.[1].toLowerCase() ?? "";
  if (ext === "stl") {
    return {
      ok: false,
      code: "stl",
      message:
        "Arquivos STL não trazem dados de fatiamento (peso e tempo). Fatie o modelo no seu programa e envie o 3MF ou o G-code, ou use a entrada manual.",
    };
  }
  if (ext === "bgcode") {
    return { ok: false, code: "bgcode", message: "G-code binário (.bgcode) ainda não é suportado. Exporte como G-code comum (ASCII) ou use o 3MF." };
  }
  if (ext !== "3mf" && ext !== "gcode" && ext !== "gco") {
    return { ok: false, code: "extensao", message: "Formato não suportado. Envie um arquivo .3mf ou .gcode." };
  }
  if (!Number.isFinite(size) || size <= 0) return { ok: false, code: "vazio", message: "O arquivo está vazio." };
  if (size > MAX_FILE_BYTES) {
    return { ok: false, code: "grande_demais", message: `O arquivo tem mais de ${MAX_FILE_BYTES / MB} MB. Envie um arquivo menor ou use a entrada manual.` };
  }
  return { ok: true, kind: ext === "3mf" ? "3mf" : "gcode" };
}
