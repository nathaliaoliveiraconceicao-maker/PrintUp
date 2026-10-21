export const ORDER_STATUSES = ["novo", "aguardando_pagamento", "em_producao", "pronto", "entregue", "cancelado"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  novo: "Novo",
  aguardando_pagamento: "Aguardando pagamento",
  em_producao: "Em produção",
  pronto: "Pronto",
  entregue: "Entregue",
  cancelado: "Cancelado",
};

export const PAYMENT_STATUSES = ["pendente", "parcial", "pago"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = { pendente: "Pagamento pendente", parcial: "Pago em parte", pago: "Pago" };

export const PAYMENT_METHODS = ["pix", "dinheiro", "cartao_credito", "cartao_debito", "transferencia", "boleto", "outro"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  pix: "Pix",
  dinheiro: "Dinheiro",
  cartao_credito: "Cartão de crédito",
  cartao_debito: "Cartão de débito",
  transferencia: "Transferência",
  boleto: "Boleto",
  outro: "Outro",
};

/** Transições manuais aceitas — o banco (`orders_guard`) impõe a mesma regra. Cancelar é uma ação própria (libera estoque). */
const NEXT: Record<OrderStatus, OrderStatus[]> = {
  novo: ["aguardando_pagamento", "em_producao", "pronto"],
  aguardando_pagamento: ["novo", "em_producao", "pronto"],
  em_producao: ["pronto", "aguardando_pagamento"],
  pronto: ["entregue", "em_producao"],
  entregue: [],
  cancelado: [],
};
export const nextOrderStatuses = (from: OrderStatus): OrderStatus[] => NEXT[from];
export const canMoveOrder = (from: OrderStatus, to: OrderStatus): boolean => NEXT[from].includes(to);
export const canCancelOrder = (s: OrderStatus): boolean => s !== "cancelado" && s !== "entregue";
/** Itens e cliente só mudam antes de entrar em produção. */
export const orderIsEditable = (s: OrderStatus, hasJobs: boolean): boolean => (s === "novo" || s === "aguardando_pagamento") && !hasJobs;

/** Prazo vencido: pedido ainda não entregue nem cancelado, com data de entrega anterior a hoje. */
export function isOrderOverdue(status: OrderStatus, dueDate: string | null, today: string): boolean {
  return Boolean(dueDate) && status !== "entregue" && status !== "cancelado" && (dueDate as string) < today;
}

export const JOB_STAGES = ["aguardando", "preparando", "imprimindo", "acabamento", "concluido"] as const;
export type JobStage = (typeof JOB_STAGES)[number] | "cancelado";
export const JOB_STAGE_LABEL: Record<JobStage, string> = {
  aguardando: "Aguardando",
  preparando: "Preparando",
  imprimindo: "Imprimindo",
  acabamento: "Acabamento",
  concluido: "Concluído",
  cancelado: "Cancelado",
};
/** Tarefa atrasada: não concluída/cancelada e o prazo do pedido já passou. */
export function isJobOverdue(stage: JobStage, orderDue: string | null, orderStatus: OrderStatus, today: string): boolean {
  return Boolean(orderDue) && stage !== "concluido" && stage !== "cancelado" && orderStatus !== "cancelado" && (orderDue as string) < today;
}
/** Etapas para onde dá para mover (menos Concluído, que pede o consumo real). */
export const MOVABLE_STAGES = ["aguardando", "preparando", "imprimindo", "acabamento"] as const;
export const previousStage = (s: JobStage): JobStage | null => { const i = MOVABLE_STAGES.indexOf(s as (typeof MOVABLE_STAGES)[number]); return i > 0 ? MOVABLE_STAGES[i - 1] : null; };
export const followingStage = (s: JobStage): JobStage | null => { const i = MOVABLE_STAGES.indexOf(s as (typeof MOVABLE_STAGES)[number]); return i >= 0 && i < MOVABLE_STAGES.length - 1 ? MOVABLE_STAGES[i + 1] : null; };
