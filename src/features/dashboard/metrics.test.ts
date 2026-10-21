import { describe, expect, it } from "vitest";
import { quoteMetrics, type QuoteForMetrics } from "./metrics";

const q = (status: QuoteForMetrics["status"], total: number, cost: number | null = null): QuoteForMetrics => ({ status, total, internal_cost_total: cost });

describe("quoteMetrics", () => {
  it("sem orçamentos: tudo zerado e lucro desconhecido (nada inventado)", () => {
    expect(quoteMetrics([])).toEqual({ created: 0, approved: 0, awaiting: 0, drafts: 0, approvedTotal: 0, estimatedProfit: null, approvedWithoutCost: 0 });
  });
  it("conta por status e soma só os aprovados", () => {
    const m = quoteMetrics([q("rascunho", 50), q("enviado", 100), q("aprovado", 121.5, 60), q("aprovado", 80, 30), q("recusado", 999), q("expirado", 10)]);
    expect(m.created).toBe(6);
    expect(m.approved).toBe(2);
    expect(m.awaiting).toBe(1);
    expect(m.drafts).toBe(1);
    expect(m.approvedTotal).toBe(201.5);
    expect(m.estimatedProfit).toBe(111.5); // (121,50 − 60) + (80 − 30)
  });
  it("aprovado sem custo conhecido fica fora do lucro e é contado à parte", () => {
    const m = quoteMetrics([q("aprovado", 100, 40), q("aprovado", 25, null)]);
    expect(m.approvedTotal).toBe(125);
    expect(m.estimatedProfit).toBe(60);
    expect(m.approvedWithoutCost).toBe(1);
  });
  it("só aprovados sem custo: lucro desconhecido", () => {
    expect(quoteMetrics([q("aprovado", 25)]).estimatedProfit).toBeNull();
  });
  it("centavos fecham sem erro de ponto flutuante", () => {
    expect(quoteMetrics([q("aprovado", 0.1, 0), q("aprovado", 0.2, 0)]).approvedTotal).toBe(0.3);
  });
});
