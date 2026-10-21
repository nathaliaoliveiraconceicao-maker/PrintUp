import { round2 } from "@/lib/pricing";
import type { OrderStatus } from "./status";

export interface FinItem {
  id: string;
  needs_production: boolean;
  quantity: number;
  unit_cost: number | null;
}
export interface FinJob {
  order_item_id: string;
  stage: "aguardando" | "preparando" | "imprimindo" | "acabamento" | "concluido" | "cancelado";
  quantity: number;
  real_material_cost: number | null;
  real_machine_cost: number | null;
  real_other_cost: number | null;
  failed_cost: number;
}
export interface FinInput {
  status: OrderStatus;
  total: number;
  estimated_cost: number | null;
  amount_paid: number;
  items: FinItem[];
  jobs: FinJob[];
}

export type RealizedBasis = "completo" | "proporcional" | "cancelado" | "em_andamento";

export interface OrderFinancials {
  estimatedCost: number | null;
  estimatedProfit: number | null;
  /** Receita efetivamente recebida (soma dos recebimentos menos estornos). */
  received: number;
  toReceive: number;
  /** Custo já registrado: tarefas concluídas (consumo e tempo reais) + material perdido em falhas. */
  recordedCost: number;
  /** Custo real completo; só existe quando toda a produção terminou. */
  realCost: number | null;
  productionComplete: boolean;
  realizedProfit: number | null;
  realizedBasis: RealizedBasis;
  /** Alguma tarefa concluída não tinha consumo real (ex.: sem filamento) e entrou pelo custo estimado. */
  usedEstimateFallback: boolean;
}

const cents = (n: number) => Math.round(n * 100);

/**
 * Custo e lucro de UM pedido.
 *  - Lucro estimado = total − custo estimado.
 *  - Receita recebida = o que foi lançado como pagamento; pedido não pago não é receita.
 *  - Lucro realizado só aparece quando a produção termina (ou o pedido é cancelado): antes disso o custo real ainda é parcial.
 *    Com pagamento parcial, reconhece-se a mesma fração do custo real que do valor recebido (recebido ÷ total):
 *    lucro realizado = recebido − custo real × (recebido ÷ total). Pedido cancelado: recebido − custo já incorrido.
 */
export function orderFinancials(o: FinInput): OrderFinancials {
  const itemById = new Map(o.items.map((i) => [i.id, i]));
  let usedEstimateFallback = false;

  let producedC = 0;
  let failedC = 0;
  for (const j of o.jobs) {
    failedC += cents(j.failed_cost);
    if (j.stage !== "concluido") continue;
    const parts = [j.real_material_cost, j.real_machine_cost, j.real_other_cost];
    if (parts.some((p) => p !== null)) {
      producedC += parts.reduce((a: number, p) => a + (p === null ? 0 : cents(p)), 0);
    } else {
      const it = itemById.get(j.order_item_id);
      if (it?.unit_cost != null) {
        producedC += cents(it.unit_cost) * j.quantity;
        usedEstimateFallback = true;
      }
    }
  }
  const recordedCost = (producedC + failedC) / 100;

  const needsProd = o.items.filter((i) => i.needs_production);
  const doneQty = (itemId: string) => o.jobs.filter((j) => j.order_item_id === itemId && j.stage === "concluido").reduce((a, j) => a + j.quantity, 0);
  const productionComplete = needsProd.length > 0 ? needsProd.every((i) => doneQty(i.id) >= i.quantity) : true;
  const otherItemsC = o.items.filter((i) => !i.needs_production).reduce((a, i) => a + (i.unit_cost == null ? 0 : cents(i.unit_cost) * i.quantity), 0);
  const realCost = productionComplete && o.status !== "cancelado" ? (producedC + failedC + otherItemsC) / 100 : null;

  const cancelled = o.status === "cancelado";
  const received = round2(o.amount_paid);
  let realizedProfit: number | null = null;
  let basis: RealizedBasis = "em_andamento";
  if (cancelled) {
    realizedProfit = round2(received - recordedCost);
    basis = "cancelado";
  } else if (realCost !== null) {
    const f = o.total > 0 ? Math.min(1, Math.max(0, received / o.total)) : 0;
    realizedProfit = round2(received - realCost * f);
    basis = f >= 1 - 1e-9 ? "completo" : "proporcional";
  }

  return {
    estimatedCost: o.estimated_cost,
    estimatedProfit: o.estimated_cost === null ? null : round2(o.total - o.estimated_cost),
    received,
    toReceive: cancelled ? 0 : round2(Math.max(0, o.total - received)),
    recordedCost,
    realCost,
    productionComplete,
    realizedProfit,
    realizedBasis: basis,
    usedEstimateFallback,
  };
}

export interface OrdersSummary {
  count: number;
  salesValue: number;
  received: number;
  toReceive: number;
  estimatedProfit: number | null;
  realizedProfit: number | null;
  /** Pedidos ativos cujo lucro realizado ainda não pode ser calculado (produção em andamento). */
  pendingRealized: number;
}

/** Totais para o painel, sem contar pedidos cancelados como venda. Lucros ficam `null` se nenhum pedido tem dado. */
export function summarizeOrders(list: { status: OrderStatus; total: number; fin: OrderFinancials }[]): OrdersSummary {
  let sales = 0, received = 0, toReceive = 0, est = 0, real = 0, nEst = 0, nReal = 0, pending = 0;
  for (const { status, total, fin } of list) {
    received += cents(fin.received);
    if (status === "cancelado") {
      if (fin.realizedProfit !== null) { real += cents(fin.realizedProfit); nReal++; }
      continue;
    }
    sales += cents(total);
    toReceive += cents(fin.toReceive);
    if (fin.estimatedProfit !== null) { est += cents(fin.estimatedProfit); nEst++; }
    if (fin.realizedProfit !== null) { real += cents(fin.realizedProfit); nReal++; } else pending++;
  }
  return {
    count: list.length,
    salesValue: sales / 100,
    received: received / 100,
    toReceive: toReceive / 100,
    estimatedProfit: nEst ? est / 100 : null,
    realizedProfit: nReal ? real / 100 : null,
    pendingRealized: pending,
  };
}
