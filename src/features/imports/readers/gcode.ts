import type { ByteSource } from "../bytes";
import { GCODE_HEAD_BYTES, GCODE_TAIL_BYTES } from "../limits";
import { missingNotes } from "../notes";
import { cleanText, parseCommentConfig, parseDurationToMinutes, parseNumber, round2, splitList } from "../text";
import type { ParsedMaterial, ParsedModel, SlicerFamily } from "../types";

/**
 * Leitor de G-code ASCII. Lê só o começo e o fim do arquivo (onde os fatiadores gravam os metadados)
 * e NUNCA interpreta comandos: apenas linhas de comentário `;` são examinadas como texto.
 *
 * Chaves reconhecidas (baseadas no que cada fatiador costuma gravar; ver docs/IMPORTADOR.md):
 *  - PrusaSlicer/Orca: `; filament used [g] = …`, `; estimated printing time (normal mode) = …`, `; printer_model = …`
 *  - Bambu Studio/Orca (cabeçalho): `; total filament weight [g] : …`, `; total estimated time: …`
 *  - Cura: `;TIME:<segundos>`, `;Filament used: <m>`, `;TARGET_MACHINE.NAME:` (não informa peso)
 */

const KEYS_FOR_RAW = [
  "printer_model",
  "printer_settings_id",
  "target_machine.name",
  "filament_type",
  "filament_settings_id",
  "layer_height",
  "layer height",
  "nozzle_diameter",
  "total filament weight [g]",
  "total filament used [g]",
  "filament used [g]",
  "filament used",
  "estimated printing time (normal mode)",
  "time",
  "support_material",
  "enable_support",
  "total filament used for wipe tower [g]",
];

function detectFamily(head: string): { family: SlicerFamily; label: string | null } {
  const lines = head.split(/\r?\n/, 300);
  for (const line of lines) {
    if (line[0] !== ";") continue;
    let m = /BambuStudio[\s-]+v?([\d.]+)/i.exec(line);
    if (m) return { family: "bambu", label: `Bambu Studio ${m[1]}` };
    m = /OrcaSlicer[\s-]+v?([\d.]+)/i.exec(line);
    if (m) return { family: "orca", label: `OrcaSlicer ${m[1]}` };
    m = /PrusaSlicer[\s-]+v?([\d.]+)/i.exec(line);
    if (m) return { family: "prusa", label: `PrusaSlicer ${m[1]}` };
    m = /Cura_SteamEngine[\s-]+v?([\d.]+)/i.exec(line);
    if (m) return { family: "cura", label: `Cura ${m[1]}` };
  }
  return { family: "unknown", label: null };
}

const positive = (n: number | null) => (n !== null && n > 0 ? n : null);

function sumAll(nums: (number | null)[]): number | null {
  if (nums.length === 0 || nums.some((n) => n === null)) return null;
  return positive(round2((nums as number[]).reduce((a, b) => a + b, 0)));
}

function boolFlag(v: string | undefined): boolean | null {
  if (v === undefined) return null;
  if (/^(1|true)$/i.test(v.trim())) return true;
  if (/^(0|false)$/i.test(v.trim())) return false;
  return null;
}

export async function readGcode(src: ByteSource, fileName: string): Promise<ParsedModel> {
  const decoder = new TextDecoder("utf-8");
  let text: string;
  if (src.size <= GCODE_HEAD_BYTES + GCODE_TAIL_BYTES) {
    text = decoder.decode(await src.read(0, src.size));
  } else {
    const head = decoder.decode(await src.read(0, GCODE_HEAD_BYTES));
    const tail = decoder.decode(await src.read(src.size - GCODE_TAIL_BYTES, src.size));
    text = `${head}\n${tail}`;
  }

  const { family, label } = detectFamily(text.slice(0, 32 * 1024));
  const kv = parseCommentConfig(text);

  // Peso
  const perFilament = (kv.get("filament used [g]") ? splitList(kv.get("filament used [g]")!) : []).map(parseNumber);
  const weightG =
    positive(parseNumber(kv.get("total filament weight [g]"))) ??
    positive(parseNumber(kv.get("total filament used [g]"))) ??
    sumAll(perFilament);

  // Tempo
  let printMinutes: number | null = null;
  const bambuTime = /model printing time:\s*[^;\n]+;\s*total estimated time:\s*([^\n]+)/i.exec(text);
  if (bambuTime) printMinutes = parseDurationToMinutes(bambuTime[1]);
  if (printMinutes === null) printMinutes = parseDurationToMinutes(kv.get("estimated printing time (normal mode)") ?? "");
  if (printMinutes === null && family === "cura") {
    const secs = positive(parseNumber(kv.get("time")));
    if (secs !== null) printMinutes = round2(secs / 60);
  }

  // Material (lista alinhada por filamento)
  const types = splitList(kv.get("filament_type") ?? "").map((t) => cleanText(t, 40));
  const colors = splitList(kv.get("filament_colour") ?? "").map((c) => (/^#[0-9a-f]{6,8}$/i.test(c) ? c : null));
  const count = Math.min(Math.max(types.length, perFilament.length > 1 ? perFilament.length : 0), 16);
  const materials: ParsedMaterial[] = Array.from({ length: count }, (_, i) => ({
    type: types[i] ?? null,
    color: colors[i] ?? null,
    grams: perFilament.length === count && count > 1 ? perFilament[i] : count === 1 ? weightG : null,
  }));

  // Impressora
  const printerSettings = cleanText(kv.get("printer_settings_id"))?.replace(/\s+\d(\.\d+)?\s*(mm\s*)?nozzle$/i, "") ?? null;
  const printerName =
    cleanText(kv.get("printer_model")) ?? printerSettings ?? cleanText(kv.get("target_machine.name"));

  const nozzles = splitList(kv.get("nozzle_diameter") ?? "").map(parseNumber);
  const nozzleMm = nozzles.length > 0 && nozzles.every((n) => n !== null && n === nozzles[0]) ? positive(nozzles[0]) : null;
  const layerHeightMm = positive(parseNumber(kv.get("layer_height") ?? kv.get("layer height")));

  const wasteRaw = parseNumber(kv.get("total filament used for wipe tower [g]"));

  const rawMeta: Record<string, string> = {};
  for (const k of KEYS_FOR_RAW) {
    const v = cleanText(kv.get(k), 160);
    if (v) rawMeta[k] = v;
  }
  if (bambuTime) rawMeta["total estimated time"] = cleanText(bambuTime[1], 60) ?? "";

  const hasSliceData = weightG !== null || printMinutes !== null;
  const model: ParsedModel = {
    kind: "gcode",
    slicerFamily: family,
    slicerLabel: label,
    title: null,
    designer: null,
    printerName,
    printerModelCode: null,
    nozzleMm,
    layerHeightMm,
    plateCount: null,
    plates: [
      {
        index: null,
        name: fileName.replace(/\.[^.]+$/, ""),
        printMinutes,
        weightG,
        materials,
        pieceCount: null,
        supportUsed: boolFlag(kv.get("enable_support") ?? kv.get("support_material")),
        wasteG: wasteRaw !== null && wasteRaw >= 0 ? wasteRaw : null,
      },
    ],
    thumbnail: null,
    hasSliceData,
    notes: [],
    rawMeta,
  };
  model.notes = missingNotes(model);

  if (family === "cura" && weightG === null) {
    const meters = cleanText(kv.get("filament used"), 40);
    model.notes.push(
      `O Cura informa apenas o comprimento do filamento${meters ? ` (${meters})` : ""}, e não o peso. Informe o peso manualmente.`,
    );
  }
  if (family === "unknown" && !hasSliceData) {
    model.notes.push("Não reconhecemos o programa que gerou este G-code.");
  }
  return model;
}
