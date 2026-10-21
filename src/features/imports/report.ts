import type { ParsedModel } from "./types";

const val = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));

/**
 * Relatório de leitura em texto, para conferir o importador com um arquivo REAL: mostra o que foi reconhecido,
 * o que não foi e a ESTRUTURA do arquivo (apenas nomes de entradas/chaves, nunca o conteúdo). O nome do arquivo
 * aparece; apague-o antes de compartilhar se for sensível.
 */
export function buildReadingReport(model: ParsedModel, file: { name: string; size: number }): string {
  const lines: string[] = [];
  lines.push("# Relatório de leitura — importador do PrintUp");
  lines.push(`Arquivo: ${file.name} · formato: ${model.kind} · tamanho: ${file.size} bytes`);
  lines.push(`Programa identificado: ${val(model.slicerLabel)} (família: ${model.slicerFamily})`);
  lines.push(`Arquivo sintético de exemplo: ${model.synthetic ? "SIM (não é exportação real)" : "não"}`);
  lines.push(`Título: ${val(model.title)} · autor: ${val(model.designer)}`);
  lines.push(`Impressora: ${val(model.printerName)} · código: ${val(model.printerModelCode)} · bico: ${val(model.nozzleMm)} mm · camada: ${val(model.layerHeightMm)} mm`);
  lines.push(`Placas no projeto: ${val(model.plateCount)} · placas lidas: ${model.plates.length} · tem dados de fatiamento: ${model.hasSliceData ? "sim" : "não"}`);
  model.plates.forEach((p, i) => {
    const mats = p.materials.length > 0 ? p.materials.map((m) => `${val(m.type)} ${val(m.color)} ${val(m.grams)} g`).join(" | ") : "—";
    lines.push(
      `Placa ${i + 1} (índice ${val(p.index)}): tempo ${val(p.printMinutes)} min · peso ${val(p.weightG)} g · peças ${val(p.pieceCount)} · suportes ${p.supportUsed === null ? "—" : p.supportUsed ? "sim" : "não"} · desperdício ${val(p.wasteG)} g · materiais: ${mats}`,
    );
  });
  const raw = Object.entries(model.rawMeta);
  lines.push("", "Chaves reconhecidas:");
  lines.push(...(raw.length > 0 ? raw.map(([k, v]) => `  ${k} = ${v}`) : ["  (nenhuma)"]));
  lines.push("", model.kind === "3mf" ? "Entradas do ZIP (somente nomes):" : "Chaves de comentário vistas (somente nomes):");
  lines.push(...(model.structure.length > 0 ? model.structure.map((n) => `  ${n}`) : ["  (nenhuma)"]));
  lines.push("", "Avisos do leitor:");
  lines.push(...(model.notes.length > 0 ? model.notes.map((n) => `  - ${n}`) : ["  (nenhum)"]));
  return lines.join("\n");
}
