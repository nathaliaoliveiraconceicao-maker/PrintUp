/** Pontuação 0–100 de uma oportunidade. 100% determinística; os pesos são configuráveis no Superadmin. */
export type ScoreWeights = { discount: number; history: number; relevance: number; availability: number; store: number; quality: number; coupon: number; freshness: number };

export const DEFAULT_WEIGHTS: ScoreWeights = { discount: 30, history: 20, relevance: 10, availability: 10, store: 10, quality: 10, coupon: 5, freshness: 5 };

export type ScoreInput = {
  currentCents: number | null;
  discountPct: number | null;
  discountBasis: "loja" | "observado" | null;
  historyObservations: number;
  historySpanDays: number;
  historyMedianCents: number | null;
  relevance: number; // 0..1 (classificação por palavras-chave; IA pode sugerir, não decide)
  inStock: boolean | null;
  storeReliability: number; // 0..100
  dataQuality: number; // 0..1 (campos completos e coerentes)
  coupon: { valid: boolean; daysLeft: number | null } | null;
  ageHours: number; // idade da última verificação
  flags?: string[];
};

export type ScorePart = { value: number; weight: number; points: number };
export type ScoreResult = { score: number; parts: Record<keyof ScoreWeights, ScorePart>; flags: string[] };

const clamp = (n: number, a = 0, b = 1) => Math.min(b, Math.max(a, n));

export function scoreOffer(i: ScoreInput, weights: ScoreWeights = DEFAULT_WEIGHTS): ScoreResult {
  const flags = [...(i.flags ?? [])];
  const value: Record<keyof ScoreWeights, number> = {
    // desconto só conta com base comprovada; "observado" vale um pouco menos que o declarado pela loja
    discount: i.discountPct && i.discountBasis ? clamp(i.discountPct / 40) * (i.discountBasis === "loja" ? 1 : 0.9) : 0,
    history: 0.3, // neutro quando não há histórico suficiente
    relevance: clamp(i.relevance),
    availability: i.inStock === true ? 1 : i.inStock === false ? 0 : 0.4,
    store: clamp(i.storeReliability / 100),
    quality: clamp(i.dataQuality),
    coupon: i.coupon?.valid ? clamp(i.coupon.daysLeft === null ? 0.8 : i.coupon.daysLeft / 7) : 0,
    freshness: clamp(1 - i.ageHours / 72),
  };
  if (i.historyObservations >= 5 && i.historySpanDays >= 7 && i.historyMedianCents && i.currentCents) {
    const ratio = i.currentCents / i.historyMedianCents;
    value.history = clamp((1 - ratio) / 0.2); // 20% abaixo da mediana ou mais = máximo; igual ou acima = 0
  } else flags.push("historico_insuficiente");

  const total = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  const parts = {} as Record<keyof ScoreWeights, ScorePart>;
  let score = 0;
  for (const k of Object.keys(weights) as (keyof ScoreWeights)[]) {
    const points = (value[k] * weights[k] * 100) / total;
    parts[k] = { value: Math.round(value[k] * 1000) / 1000, weight: weights[k], points: Math.round(points * 10) / 10 };
    score += points;
  }
  // travas: dados ruins nunca viram "ótima oferta"
  if (!i.currentCents) { score = 0; flags.push("sem_preco"); }
  if (i.inStock === false) { score = Math.min(score, 40); flags.push("sem_estoque"); }
  if (i.ageHours > 72) { score = Math.min(score, 50); flags.push("verificacao_antiga"); }
  if (i.discountPct && i.discountPct > 70) flags.push("desconto_extremo");
  return { score: Math.round(clamp(score / 100) * 100), parts, flags: [...new Set(flags)] };
}

export type PublishSettings = { autoPublish: boolean; minScorePublish: number; minScoreReview: number };
export const DEFAULT_PUBLISH: PublishSettings = { autoPublish: false, minScorePublish: 75, minScoreReview: 45 };

/** Flags que SEMPRE mandam para revisão humana, mesmo com nota alta. */
export const REVIEW_FLAGS = ["preco_anterior_inflado", "desconto_extremo", "preco_anterior_nao_maior", "dados_inconsistentes", "imagem_ausente", "sem_link_afiliado", "primeiro_registro"] as const;

export type Decision = { action: "publicar" | "revisao" | "descartar"; reason: string };

export function decidePublication(r: { score: number; flags: string[] }, s: PublishSettings): Decision {
  const blocking = r.flags.filter((f) => (REVIEW_FLAGS as readonly string[]).includes(f));
  if (r.flags.includes("sem_preco")) return { action: "descartar", reason: "sem_preco" };
  if (r.score < s.minScoreReview) return { action: "descartar", reason: "nota_baixa" };
  if (blocking.length) return { action: "revisao", reason: blocking[0] };
  if (r.score >= s.minScorePublish) return s.autoPublish ? { action: "publicar", reason: "nota_alta" } : { action: "revisao", reason: "publicacao_automatica_desligada" };
  return { action: "revisao", reason: "nota_intermediaria" };
}
