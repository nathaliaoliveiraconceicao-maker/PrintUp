/** Regras puras da integração com a calculadora: de um preço por kg ofertado para o custo do filamento do usuário. */
export type PriceChangePlan =
  | { kind: "novo"; newPerKg: number }
  | { kind: "igual"; current: number }
  | { kind: "atualizar"; current: number; newPerKg: number; deltaPerKg: number; savingPer100g: number; needsConfirmation: true };

const round2 = (n: number) => Math.round(n * 100) / 100;

/** `newPerKgCents` vem da OFERTA no banco (nunca do navegador); `currentPerKg` é o valor atual do filamento do usuário, se houver. */
export function planPriceChange(newPerKgCents: number, currentPerKg: number | null): PriceChangePlan {
  const next = round2(newPerKgCents / 100);
  if (currentPerKg === null) return { kind: "novo", newPerKg: next };
  const cur = round2(currentPerKg);
  if (cur === next) return { kind: "igual", current: cur };
  return { kind: "atualizar", current: cur, newPerKg: next, deltaPerKg: round2(next - cur), savingPer100g: round2(((cur - next) / 1000) * 100), needsConfirmation: true };
}

const MAP: Record<string, string> = { PLA: "PLA", PETG: "PETG", ABS: "ABS", ASA: "ASA", TPU: "TPU", NYLON: "Nylon" };
export const materialFromCategory = (category: string, specMaterial?: string | null): string =>
  (specMaterial && MAP[specMaterial.toUpperCase()]) || ({ "filamento-pla": "PLA", "filamento-petg": "PETG", "filamento-abs": "ABS", "filamento-tpu": "TPU" } as Record<string, string>)[category] || "Outro";
