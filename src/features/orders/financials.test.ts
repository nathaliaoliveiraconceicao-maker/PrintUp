import { describe, expect, it } from "vitest";
import { orderFinancials, summarizeOrders, type FinInput, type FinJob } from "./financials";
import { canCancelOrder, canMoveOrder, isJobOverdue, isOrderOverdue, orderIsEditable } from "./status";

const job = (over: Partial<FinJob> = {}): FinJob => ({
  order_item_id: "i1", stage: "concluido", quantity: 4, real_material_cost: 40, real_machine_cost: 30, real_other_cost: 12, failed_cost: 0, ...over,
});
const order = (over: Partial<FinInput> = {}): FinInput => ({
  status: "pronto", total: 200, estimated_cost: 84, amount_paid: 200,
  items: [{ id: "i1", needs_production: true, quantity: 4, unit_cost: 21 }, { id: "i2", needs_production: false, quantity: 1, unit_cost: null }],
  jobs: [job()], ...over,
});

describe("orderFinancials", () => {
  it("lucro estimado = total − custo estimado", () => {
    const f = orderFinancials(order());
    expect(f.estimatedCost).toBe(84);
    expect(f.estimatedProfit).toBe(116);
  });

  it("pago por completo e produção concluída: lucro realizado = recebido − custo real", () => {
    const f = orderFinancials(order());
    expect(f.realCost).toBe(82);
    expect(f.realizedProfit).toBe(118);
    expect(f.realizedBasis).toBe("completo");
  });

  it("consumo real maior que o previsto reduz o lucro realizado, não o estimado", () => {
    const f = orderFinancials(order({ jobs: [job({ real_material_cost: 60 })] }));
    expect(f.estimatedProfit).toBe(116);
    expect(f.realizedProfit).toBe(98);
  });

  it("falha de impressão entra no custo real", () => {
    const f = orderFinancials(order({ jobs: [job({ failed_cost: 3 })] }));
    expect(f.realCost).toBe(85);
    expect(f.realizedProfit).toBe(115);
  });

  it("pedido não pago não gera receita nem lucro realizado positivo", () => {
    const f = orderFinancials(order({ amount_paid: 0 }));
    expect(f.received).toBe(0);
    expect(f.toReceive).toBe(200);
    expect(f.realizedProfit).toBe(0);
    expect(f.realizedBasis).toBe("proporcional");
  });

  it("pagamento parcial reconhece a mesma fração do custo (100 de 200 = 50%)", () => {
    const f = orderFinancials(order({ amount_paid: 100 }));
    expect(f.toReceive).toBe(100);
    expect(f.realizedProfit).toBe(59); // 100 − 82 × 0,5
    expect(f.realizedBasis).toBe("proporcional");
  });

  it("produção em andamento: sem lucro realizado, mas com o custo já registrado", () => {
    const f = orderFinancials(order({ status: "em_producao", jobs: [job({ quantity: 3 })] }));
    expect(f.productionComplete).toBe(false);
    expect(f.realizedProfit).toBeNull();
    expect(f.realizedBasis).toBe("em_andamento");
    expect(f.recordedCost).toBe(82);
  });

  it("tarefa cancelada não conta como produzida", () => {
    const f = orderFinancials(order({ status: "em_producao", jobs: [job({ stage: "cancelado" })] }));
    expect(f.productionComplete).toBe(false);
    expect(f.recordedCost).toBe(0);
  });

  it("cancelado: sem venda a receber; lucro = recebido − custo já incorrido (consumo e falhas)", () => {
    const f = orderFinancials(order({ status: "cancelado", amount_paid: 50, jobs: [job({ stage: "imprimindo", failed_cost: 6 })] }));
    expect(f.toReceive).toBe(0);
    expect(f.realCost).toBeNull();
    expect(f.realizedBasis).toBe("cancelado");
    expect(f.realizedProfit).toBe(44);
  });

  it("tarefa concluída sem consumo real cai no custo estimado e avisa", () => {
    const f = orderFinancials(order({ jobs: [job({ real_material_cost: null, real_machine_cost: null, real_other_cost: null })] }));
    expect(f.usedEstimateFallback).toBe(true);
    expect(f.realCost).toBe(84);
  });

  it("sem custo estimado conhecido, não inventa lucro estimado", () => {
    expect(orderFinancials(order({ estimated_cost: null })).estimatedProfit).toBeNull();
  });

  it("só personalização (sem produção): considera a produção completa", () => {
    const f = orderFinancials(order({ items: [{ id: "i2", needs_production: false, quantity: 1, unit_cost: null }], jobs: [], estimated_cost: null }));
    expect(f.productionComplete).toBe(true);
    expect(f.realizedProfit).toBe(200);
  });
});

describe("summarizeOrders", () => {
  it("soma vendas, a receber e lucros sem contar cancelados como venda", () => {
    const a = order();
    const b = order({ status: "em_producao", total: 100, estimated_cost: 40, amount_paid: 30, jobs: [] });
    const c = order({ status: "cancelado", total: 500, amount_paid: 0, jobs: [] });
    const s = summarizeOrders([a, b, c].map((o) => ({ status: o.status, total: o.total, fin: orderFinancials(o) })));
    expect(s.salesValue).toBe(300);
    expect(s.received).toBe(230);
    expect(s.toReceive).toBe(70);
    expect(s.estimatedProfit).toBe(116 + 60);
    expect(s.realizedProfit).toBe(118 + 0);
    expect(s.pendingRealized).toBe(1);
  });
  it("sem pedidos: tudo zero e lucros desconhecidos", () => {
    const s = summarizeOrders([]);
    expect(s).toMatchObject({ count: 0, salesValue: 0, estimatedProfit: null, realizedProfit: null });
  });
});

describe("status e atrasos", () => {
  it("transições", () => {
    expect(canMoveOrder("novo", "aguardando_pagamento")).toBe(true);
    expect(canMoveOrder("pronto", "entregue")).toBe(true);
    expect(canMoveOrder("entregue", "novo")).toBe(false);
    expect(canMoveOrder("cancelado", "novo")).toBe(false);
    expect(canCancelOrder("em_producao")).toBe(true);
    expect(canCancelOrder("entregue")).toBe(false);
    expect(orderIsEditable("novo", false)).toBe(true);
    expect(orderIsEditable("novo", true)).toBe(false);
    expect(orderIsEditable("em_producao", false)).toBe(false);
  });
  it("atraso de pedido e de tarefa", () => {
    expect(isOrderOverdue("em_producao", "2026-01-10", "2026-01-11")).toBe(true);
    expect(isOrderOverdue("em_producao", "2026-01-10", "2026-01-10")).toBe(false);
    expect(isOrderOverdue("entregue", "2026-01-10", "2026-02-01")).toBe(false);
    expect(isOrderOverdue("cancelado", "2026-01-10", "2026-02-01")).toBe(false);
    expect(isOrderOverdue("novo", null, "2026-02-01")).toBe(false);
    expect(isJobOverdue("imprimindo", "2026-01-10", "em_producao", "2026-01-11")).toBe(true);
    expect(isJobOverdue("concluido", "2026-01-10", "em_producao", "2026-01-11")).toBe(false);
  });
});
