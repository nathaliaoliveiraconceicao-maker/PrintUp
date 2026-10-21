import { round2 } from "@/lib/pricing";

export interface QuoteForMetrics {
  status: "rascunho" | "enviado" | "aprovado" | "recusado" | "expirado";
  total: number;
  internal_cost_total: number | null;
}

export interface QuoteMetrics {
  created: number;
  approved: number;
  /** Aguardando resposta do cliente (enviados). */
  awaiting: number;
  drafts: number;
  /** Soma dos orçamentos aprovados: valor ORÇADO e aprovado, não venda recebida. */
  approvedTotal: number;
  /** Aprovado − custo de produção, só dos aprovados com custo conhecido. `null` se nenhum tem custo. */
  estimatedProfit: number | null;
  /** Aprovados sem custo conhecido (ex.: só personalizações): ficam fora do lucro estimado. */
  approvedWithoutCost: number;
}

/** Indicadores de orçamentos a partir dos dados reais. Sem módulo de vendas, nada aqui é faturamento. */
export function quoteMetrics(quotes: QuoteForMetrics[]): QuoteMetrics {
  const approved = quotes.filter((q) => q.status === "aprovado");
  const withCost = approved.filter((q) => q.internal_cost_total !== null);
  const profitCents = withCost.reduce((a, q) => a + Math.round(q.total * 100) - Math.round((q.internal_cost_total as number) * 100), 0);
  return {
    created: quotes.length,
    approved: approved.length,
    awaiting: quotes.filter((q) => q.status === "enviado").length,
    drafts: quotes.filter((q) => q.status === "rascunho").length,
    approvedTotal: round2(approved.reduce((a, q) => a + Math.round(q.total * 100), 0) / 100),
    estimatedProfit: withCost.length > 0 ? profitCents / 100 : null,
    approvedWithoutCost: approved.length - withCost.length,
  };
}
