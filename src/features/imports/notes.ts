import type { ParsedModel } from "./types";

/** Avisos (pt-BR) sobre o que o arquivo NÃO trouxe. Nunca preenchemos esses campos por suposição. */
export function missingNotes(m: ParsedModel): string[] {
  const notes: string[] = [];
  const plates = m.plates;
  if (!m.hasSliceData) {
    notes.push(
      "Este arquivo não contém dados de fatiamento (tempo e peso). Fatie o modelo no seu programa e exporte novamente, ou informe os dados manualmente.",
    );
  } else {
    if (plates.length > 0 && plates.every((p) => p.weightG === null)) notes.push("Peso do filamento: não encontrado no arquivo.");
    if (plates.length > 0 && plates.every((p) => p.printMinutes === null)) notes.push("Tempo de impressão: não encontrado no arquivo.");
  }
  if (!m.printerName && !m.printerModelCode) notes.push("Impressora: o arquivo não informa para qual impressora foi fatiado.");
  if (plates.length > 0 && plates.every((p) => p.materials.length === 0)) notes.push("Material: não encontrado no arquivo.");
  if (!m.title) notes.push("Nome do modelo: o arquivo não traz; usamos o nome do arquivo.");
  return notes;
}
