/**
 * Compara a impressora para a qual o arquivo foi fatiado com a impressora escolhida pelo usuário.
 *
 * Regra: só dizemos "igual" quando os nomes coincidem por completo (depois de ignorar acentos, maiúsculas e palavras
 * genéricas). Dúvida => "diferente": um alerta a mais é inofensivo; um alerta que falta engana o preço.
 */
export type PrinterMatch = "igual" | "diferente" | "desconhecida";

const NOISE = new Set(["lab", "labs", "3d", "printer", "impressora", "the", "nozzle", "mm"]);

export function nameTokens(name: string): string[] {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9.]+/)
    .filter((t) => t && !NOISE.has(t))
    .sort();
}

export interface RegisteredPrinterNames {
  name: string;
  brand?: string | null;
  model?: string | null;
}

export function comparePrinters(slicerPrinter: string | null | undefined, chosen: RegisteredPrinterNames | null | undefined): PrinterMatch {
  if (!slicerPrinter || nameTokens(slicerPrinter).length === 0) return "desconhecida";
  if (!chosen) return "desconhecida";
  const wanted = nameTokens(slicerPrinter).join("|");
  const candidates = [chosen.name, [chosen.brand, chosen.model].filter(Boolean).join(" "), chosen.model ?? ""];
  return candidates.some((c) => c && nameTokens(c).join("|") === wanted) ? "igual" : "diferente";
}

export function printerMatchMessage(match: PrinterMatch, slicerPrinter: string | null | undefined, chosenName: string | null | undefined): string | null {
  if (match === "diferente") {
    return `Este tempo foi estimado para "${slicerPrinter}", mas você escolheu "${chosenName}". O tempo real pode ser diferente: confira ou ajuste o valor.`;
  }
  return null;
}
