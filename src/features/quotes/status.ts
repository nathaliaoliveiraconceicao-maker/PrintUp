export const QUOTE_STATUSES = ["rascunho", "enviado", "aprovado", "recusado", "expirado"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const STATUS_LABEL: Record<QuoteStatus, string> = {
  rascunho: "Rascunho",
  enviado: "Enviado",
  aprovado: "Aprovado",
  recusado: "Recusado",
  expirado: "Expirado",
};

/** Transições aceitas — o banco (`quotes_guard`) impõe a mesma regra. */
const NEXT: Record<QuoteStatus, QuoteStatus[]> = {
  rascunho: ["enviado", "aprovado", "recusado"],
  enviado: ["aprovado", "recusado", "rascunho"],
  aprovado: [],
  recusado: ["rascunho"],
  expirado: ["rascunho"],
};

export const canTransition = (from: QuoteStatus, to: QuoteStatus): boolean => NEXT[from].includes(to);
export const nextStatuses = (from: QuoteStatus): QuoteStatus[] => NEXT[from];

/** Data de hoje (AAAA-MM-DD) no fuso de Brasília — as validades são datas, não instantes. */
export function todayBR(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(now);
}

/** "Expirado" é derivado: rascunho ou enviado cuja validade (inclusive) já passou. */
export function effectiveStatus(status: QuoteStatus, validUntil: string, today: string = todayBR()): QuoteStatus {
  if ((status === "rascunho" || status === "enviado") && validUntil < today) return "expirado";
  return status;
}

/** Soma dias a uma data AAAA-MM-DD (UTC, sem surpresas de horário de verão). */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const formatDateBR = (date: string): string => {
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
};

export const formatQuoteNumber = (n: number): string => `#${String(n).padStart(4, "0")}`;
