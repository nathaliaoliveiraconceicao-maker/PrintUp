/** Resultado padronizado de qualquer leitor de arquivo. Campo ausente no arquivo = `null` (nunca um valor inventado). */

export type SlicerFamily = "bambu" | "orca" | "prusa" | "cura" | "unknown";

export interface ParsedMaterial {
  type: string | null;
  color: string | null;
  grams: number | null;
}

/** Uma placa (3MF) ou o trabalho único (G-code). */
export interface ParsedPlate {
  index: number | null;
  name: string | null;
  printMinutes: number | null;
  weightG: number | null;
  materials: ParsedMaterial[];
  pieceCount: number | null;
  supportUsed: boolean | null;
  wasteG: number | null;
}

export interface ParsedModel {
  kind: "3mf" | "gcode";
  slicerFamily: SlicerFamily;
  /** Ex.: "Bambu Studio 01.08.00.62". */
  slicerLabel: string | null;
  title: string | null;
  designer: string | null;
  printerName: string | null;
  /** Código interno do fabricante quando o arquivo só traz isso (ex.: "N2S"); não é traduzido por nós. */
  printerModelCode: string | null;
  nozzleMm: number | null;
  layerHeightMm: number | null;
  plateCount: number | null;
  plates: ParsedPlate[];
  /** PNG validado (assinatura e tamanho). */
  thumbnail: Uint8Array | null;
  /** `true` se ao menos uma placa trouxe tempo ou peso. `false` = só geometria: é preciso fatiar. */
  hasSliceData: boolean;
  /** Mensagens (pt-BR) sobre o que NÃO foi encontrado. */
  notes: string[];
  /** `true` quando o arquivo se declara um exemplo SINTÉTICO do PrintUp (não é exportação real de nenhum programa). */
  synthetic: boolean;
  /** Só NOMES: entradas do ZIP (3MF) ou chaves de comentário vistas (G-code). Serve para conferir arquivos reais. */
  structure: string[];
  /** Chaves reconhecidas e seus valores, para conferência na tela. */
  rawMeta: Record<string, string>;
}

export type RejectCode =
  | "extensao"
  | "vazio"
  | "grande_demais"
  | "tipo_invalido"
  | "binario"
  | "stl"
  | "bgcode"
  | "zip_invalido"
  | "zip_inseguro"
  | "falha";

export type ParseResult =
  | { status: "ok"; model: ParsedModel }
  | { status: "rejected"; code: RejectCode; message: string };
