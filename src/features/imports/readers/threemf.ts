import type { ByteSource } from "../bytes";
import { ZIP_LIMITS } from "../limits";
import { missingNotes } from "../notes";
import { ZipError, ZipReader } from "../safe-zip";
import {
  cleanText,
  isPng,
  parseCommentConfig,
  parseNumber,
  round2,
  splitList,
  xmlBlocks,
  xmlKeyValueMetadata,
  xmlNamedMetadata,
  xmlTags,
} from "../text";
import type { ParsedMaterial, ParsedModel, ParsedPlate, SlicerFamily } from "../types";

/**
 * Leitor de 3MF. Só entradas de uma lista permitida são lidas (metadados e miniatura); a geometria nunca é carregada.
 *
 * Estruturas reconhecidas (ver docs/IMPORTADOR.md; NÃO validadas com arquivos reais ainda):
 *  - Bambu Studio / OrcaSlicer: `Metadata/slice_info.config` (tempo `prediction` em segundos, `weight`, `<filament>`),
 *    `Metadata/project_settings.config` (JSON), `Metadata/model_settings.config`, `Metadata/plate_N.png`.
 *  - PrusaSlicer: `Metadata/Slic3r_PE.config` (projeto sem fatiamento).
 *  - Qualquer 3MF: `3D/3dmodel.model` (Title, Designer, Application) e `Metadata/thumbnail.png`.
 */

const TEXT = { maxBytes: ZIP_LIMITS.maxTextBytes } as const;
const positive = (n: number | null) => (n !== null && n > 0 ? n : null);

function identifyApp(app: string | undefined): { family: SlicerFamily; label: string | null } | null {
  const a = cleanText(app, 80);
  if (!a) return null;
  let m = /^BambuStudio[\s-]+v?([\d.]+)/i.exec(a);
  if (m) return { family: "bambu", label: `Bambu Studio ${m[1]}` };
  m = /^OrcaSlicer[\s-]+v?([\d.]+)/i.exec(a);
  if (m) return { family: "orca", label: `OrcaSlicer ${m[1]}` };
  m = /^PrusaSlicer[\s-]+v?([\d.]+)/i.exec(a);
  if (m) return { family: "prusa", label: `PrusaSlicer ${m[1]}` };
  if (/^(UltiMaker )?Cura/i.test(a)) return { family: "cura", label: a };
  return { family: "unknown", label: a };
}

function boolFlag(v: string | undefined): boolean | null {
  if (v === undefined) return null;
  if (/^(1|true)$/i.test(v.trim())) return true;
  if (/^(0|false)$/i.test(v.trim())) return false;
  return null;
}

function parseJsonObject(text: string | null): Record<string, unknown> | null {
  if (!text) return null;
  try {
    const v: unknown = JSON.parse(text);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Valor de texto de um JSON de configuração (string, ou primeiro item de uma lista). */
function jsonText(obj: Record<string, unknown> | null, key: string): string | null {
  if (!obj || !Object.prototype.hasOwnProperty.call(obj, key)) return null;
  const v = obj[key];
  const first = Array.isArray(v) ? v[0] : v;
  return typeof first === "string" || typeof first === "number" ? cleanText(String(first), 160) : null;
}

function jsonList(obj: Record<string, unknown> | null, key: string): string[] {
  if (!obj || !Object.prototype.hasOwnProperty.call(obj, key)) return [];
  const v = obj[key];
  if (Array.isArray(v)) return v.map((x) => cleanText(typeof x === "string" || typeof x === "number" ? String(x) : "", 40)).filter((x): x is string => !!x);
  return typeof v === "string" ? splitList(v) : [];
}

export async function readThreeMf(src: ByteSource, fileName: string): Promise<ParsedModel> {
  const zip = await ZipReader.open(src);
  if (!zip.has("[Content_Types].xml") && !zip.has("3D/3dmodel.model")) {
    throw new ZipError("invalido", "Não parece um arquivo 3MF válido.");
  }

  const modelHead = await zip.readText("3D/3dmodel.model", { maxBytes: ZIP_LIMITS.maxModelHeadBytes, truncate: true });
  const modelMeta = modelHead ? xmlNamedMetadata(modelHead) : {};
  const sliceInfo = await zip.readText("Metadata/slice_info.config", TEXT);
  const modelSettings = await zip.readText("Metadata/model_settings.config", TEXT);
  const projectSettings = parseJsonObject(await zip.readText("Metadata/project_settings.config", TEXT));
  const prusaConfigText = await zip.readText("Metadata/Slic3r_PE.config", TEXT);
  const prusaModelText = await zip.readText("Metadata/Slic3r_PE_model.config", TEXT);
  const prusaConfig = prusaConfigText ? parseCommentConfig(prusaConfigText) : null;

  // Programa que gerou o arquivo
  const headerItems: Record<string, string> = {};
  if (sliceInfo) for (const h of xmlTags(sliceInfo, "header_item")) if (h.key) headerItems[h.key] = h.value ?? "";
  let app = identifyApp(modelMeta.Application);
  if (!app && sliceInfo) {
    const v = cleanText(headerItems["X-BBL-Client-Version"], 40);
    app = { family: "bambu", label: v ? `Bambu Studio ${v}` : "Bambu Studio" };
  }
  if (!app && prusaConfig) app = { family: "prusa", label: "PrusaSlicer" };
  const family: SlicerFamily = app?.family ?? "unknown";

  // Placas fatiadas (slice_info.config)
  const plates: ParsedPlate[] = [];
  let printerCode: string | null = null;
  let nozzleFromSlice: number | null = null;
  if (sliceInfo) {
    for (const block of xmlBlocks(sliceInfo, "plate").slice(0, 200)) {
      const meta = xmlKeyValueMetadata(block);
      const materials: ParsedMaterial[] = xmlTags(block, "filament")
        .slice(0, 16)
        .map((f) => ({
          type: cleanText(f.type, 40),
          color: f.color && /^#[0-9a-f]{6,8}$/i.test(f.color) ? f.color : null,
          grams: positive(parseNumber(f.used_g)),
        }));
      const gramsSum = materials.length > 0 && materials.every((m) => m.grams !== null)
        ? round2(materials.reduce((a, m) => a + (m.grams as number), 0))
        : null;
      const pred = positive(parseNumber(meta.prediction));
      const objects = xmlTags(block, "object").filter((o) => o.skipped !== "true");
      const index = parseNumber(meta.index);
      printerCode = printerCode ?? cleanText(meta.printer_model_id, 60);
      nozzleFromSlice = nozzleFromSlice ?? positive(parseNumber((meta.nozzle_diameters ?? "").split(/[;,]/)[0]));
      plates.push({
        index: index !== null && Number.isInteger(index) && index >= 1 ? index : null,
        name: null,
        printMinutes: pred !== null ? round2(pred / 60) : null,
        weightG: positive(parseNumber(meta.weight)) ?? gramsSum,
        materials,
        pieceCount: objects.length > 0 ? objects.length : null,
        supportUsed: boolFlag(meta.support_used),
        wasteG: null,
      });
    }
  }

  // Total de placas do projeto e nome do objeto
  let plateCount: number | null = plates.length > 0 ? plates.length : null;
  const plateNames = new Map<number, string>();
  const objectNames: string[] = [];
  if (modelSettings) {
    const blocks = xmlBlocks(modelSettings, "plate");
    if (blocks.length > 0) plateCount = blocks.length;
    for (const b of blocks) {
      const kv = xmlKeyValueMetadata(b);
      const id = parseNumber(kv.plater_id);
      const nm = cleanText(kv.plater_name, 80);
      if (id !== null && nm) plateNames.set(id, nm);
    }
    for (const o of xmlBlocks(modelSettings, "object")) {
      const nm = cleanText(xmlKeyValueMetadata(o).name, 160);
      if (nm) objectNames.push(nm);
    }
  }
  for (const p of plates) if (p.index !== null && plateNames.has(p.index)) p.name = plateNames.get(p.index) ?? null;

  if (prusaModelText) {
    for (const t of xmlTags(prusaModelText, "metadata")) {
      if (t.type === "object" && t.key === "name") {
        const nm = cleanText(t.value, 160);
        if (nm) objectNames.push(nm);
      }
    }
  }

  // Impressora, material, camada (projeto)
  const printerFromProject = jsonText(projectSettings, "printer_model") ??
    cleanText(jsonText(projectSettings, "printer_settings_id")?.replace(/\s+\d(\.\d+)?\s*(mm\s*)?nozzle$/i, ""));
  const printerFromPrusa = prusaConfig
    ? cleanText(prusaConfig.get("printer_model")) ??
      cleanText(prusaConfig.get("printer_settings_id")?.replace(/\s+\d(\.\d+)?\s*(mm\s*)?nozzle$/i, ""))
    : null;
  const printerName = printerFromProject ?? printerFromPrusa;
  const projectTypes = jsonList(projectSettings, "filament_type");
  const prusaTypes = prusaConfig ? splitList(prusaConfig.get("filament_type") ?? "").map((t) => cleanText(t, 40)).filter((t): t is string => !!t) : [];
  const fallbackTypes = projectTypes.length > 0 ? projectTypes : prusaTypes;
  // Completa o tipo de material das placas fatiadas quando o slice_info não o informa.
  for (const p of plates) {
    p.materials.forEach((m, i) => {
      if (m.type === null && fallbackTypes[i]) m.type = fallbackTypes[i];
    });
  }
  const layerHeightMm = positive(parseNumber(jsonText(projectSettings, "layer_height") ?? prusaConfig?.get("layer_height") ?? null));
  const nozzleMm = nozzleFromSlice ?? positive(parseNumber(jsonText(projectSettings, "nozzle_diameter") ?? splitList(prusaConfig?.get("nozzle_diameter") ?? "")[0] ?? null));

  // Miniatura (PNG validado)
  let thumbnail: Uint8Array | null = null;
  const firstIndex = plates.find((p) => p.index !== null)?.index ?? 1;
  for (const name of [`Metadata/plate_${firstIndex}.png`, "Metadata/plate_1.png", "Metadata/thumbnail.png", "Thumbnails/thumbnail.png"]) {
    if (!zip.has(name)) continue;
    const bytes = await zip.read(name, { maxBytes: ZIP_LIMITS.maxImageBytes });
    if (bytes && isPng(bytes)) {
      thumbnail = bytes;
      break;
    }
  }

  const title = cleanText(modelMeta.Title, 160) ?? (objectNames.length === 1 ? objectNames[0] : null);
  const hasSliceData = plates.some((p) => p.printMinutes !== null || p.weightG !== null);

  const rawMeta: Record<string, string> = {};
  const put = (k: string, v: unknown) => {
    const c = cleanText(typeof v === "string" || typeof v === "number" ? String(v) : "", 160);
    if (c) rawMeta[k] = c;
  };
  put("Application", modelMeta.Application);
  put("Title", modelMeta.Title);
  put("Designer", modelMeta.Designer);
  put("slice_info: printer_model_id", printerCode);
  put("project_settings: printer_model", jsonText(projectSettings, "printer_model"));
  put("project_settings: printer_settings_id", jsonText(projectSettings, "printer_settings_id"));
  put("project_settings: filament_type", projectTypes.join(", "));
  put("Slic3r_PE: printer_model", prusaConfig?.get("printer_model"));
  put("placas com dados", `${plates.filter((p) => p.printMinutes !== null || p.weightG !== null).length} de ${plates.length}`);

  const model: ParsedModel = {
    kind: "3mf",
    slicerFamily: family,
    slicerLabel: app?.label ?? null,
    title,
    designer: cleanText(modelMeta.Designer, 120),
    printerName,
    printerModelCode: printerCode,
    nozzleMm,
    layerHeightMm,
    plateCount,
    plates,
    thumbnail,
    hasSliceData,
    notes: [],
    rawMeta,
  };
  model.notes = missingNotes(model);
  if (!model.hasSliceData && family === "prusa") {
    model.notes.unshift("Este é um projeto do PrusaSlicer sem fatiamento: fatie o modelo e exporte o G-code para obter peso e tempo.");
  }
  void fileName;
  return model;
}
