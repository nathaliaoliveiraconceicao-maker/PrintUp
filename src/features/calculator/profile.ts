import type { Origin } from "@/features/imports/provenance";

/** Perfil de impressão (importado ou digitado) que pré-preenche a calculadora. */
export interface CalcProfile {
  id: string;
  name: string;
  modelId: string;
  modelTitle: string;
  slicerPrinterName: string | null;
  filamentType: string | null;
  weightG: number | null;
  printMinutes: number | null;
  weightOrigin: Origin;
  timeOrigin: Origin;
  editedFields: string[];
  pieceCount: number | null;
  supportUsed: boolean | null;
  wasteG: number | null;
  thumbUrl: string | null;
}
