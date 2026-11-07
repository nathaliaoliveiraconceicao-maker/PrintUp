import type { Observation } from "./pricing";

export type PriceStats = {
  current: number | null;
  min: number | null;
  max: number | null;
  avg: number | null;
  observations: number;
  spanDays: number;
  windowDays: number;
  since: Date | null;
  /** variação do preço atual frente à primeira observação dentro da janela de 7 dias (%), ou null sem dados */
  variation7dPct: number | null;
  sufficient: boolean;
};

/** Estatísticas só sobre o que FOI observado, sempre dentro de uma janela declarada. */
export function priceStats(history: Observation[], opts: { windowDays?: number; now?: Date } = {}): PriceStats {
  const now = opts.now ?? new Date();
  const windowDays = opts.windowDays ?? 90;
  const from = now.getTime() - windowDays * 86_400_000;
  const obs = history.filter((o) => o.at.getTime() >= from && o.at.getTime() <= now.getTime()).sort((a, b) => a.at.getTime() - b.at.getTime());
  if (obs.length === 0) return { current: null, min: null, max: null, avg: null, observations: 0, spanDays: 0, windowDays, since: null, variation7dPct: null, sufficient: false };
  const prices = obs.map((o) => o.priceCents);
  const first = obs[0].at.getTime();
  const last = obs[obs.length - 1];
  const spanDays = Math.round(((last.at.getTime() - first) / 86_400_000) * 10) / 10;
  const weekAgo = now.getTime() - 7 * 86_400_000;
  const baseline = obs.find((o) => o.at.getTime() >= weekAgo);
  const variation7dPct = baseline && baseline !== last && baseline.priceCents > 0 ? Math.round(((last.priceCents - baseline.priceCents) / baseline.priceCents) * 1000) / 10 : null;
  return {
    current: last.priceCents,
    min: Math.min(...prices),
    max: Math.max(...prices),
    avg: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
    observations: obs.length,
    spanDays,
    windowDays,
    since: new Date(first),
    variation7dPct,
    sufficient: obs.length >= 5 && spanDays >= 7,
  };
}

/** Texto honesto para o "menor preço": sempre com período e quantidade de observações; sem dados suficientes, não afirma. */
export function lowestPriceLabel(s: PriceStats, brl: (cents: number) => string): string {
  if (s.observations === 0 || s.min === null) return "Ainda sem histórico.";
  const scope = `nas ${s.observations} observações dos últimos ${s.windowDays} dias`;
  if (!s.sufficient) return `Menor preço observado até agora: ${brl(s.min)} (poucos dados: ${s.observations} ${s.observations === 1 ? "observação" : "observações"} em ${s.spanDays} dias).`;
  return `Menor preço observado ${scope}: ${brl(s.min)}.`;
}

/** Reduz observações a no máximo 1 por dia (a menor do dia), para gráficos e para não inchar o histórico. */
export function dailySeries(history: Observation[]): Observation[] {
  const byDay = new Map<string, Observation>();
  for (const o of history) {
    const day = o.at.toISOString().slice(0, 10);
    const cur = byDay.get(day);
    if (!cur || o.priceCents < cur.priceCents) byDay.set(day, o);
  }
  return [...byDay.values()].sort((a, b) => a.at.getTime() - b.at.getTime());
}
