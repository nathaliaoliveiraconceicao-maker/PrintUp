import { cn } from "@/lib/utils";
import { JOB_STAGE_LABEL, ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL, type JobStage, type OrderStatus, type PaymentStatus } from "./status";

const base = "inline-flex h-6 items-center whitespace-nowrap rounded-full border px-2.5 text-xs font-medium";

const ORDER_TONE: Record<OrderStatus, string> = {
  novo: "border-line bg-paper text-muted",
  aguardando_pagamento: "border-warn/30 bg-accent-soft text-warn",
  em_producao: "border-import/30 bg-import-soft text-import",
  pronto: "border-ok/30 bg-ok/10 text-ok",
  entregue: "border-ink/20 bg-ink text-paper",
  cancelado: "border-danger/30 bg-danger/10 text-danger",
};
export const OrderStatusBadge = ({ status }: { status: OrderStatus }) => <span className={cn(base, ORDER_TONE[status])}>{ORDER_STATUS_LABEL[status]}</span>;

const PAY_TONE: Record<PaymentStatus, string> = {
  pendente: "border-line bg-paper text-muted",
  parcial: "border-warn/30 bg-accent-soft text-warn",
  pago: "border-ok/30 bg-ok/10 text-ok",
};
export const PaymentBadge = ({ status }: { status: PaymentStatus }) => <span className={cn(base, PAY_TONE[status])}>{PAYMENT_STATUS_LABEL[status]}</span>;

const STAGE_TONE: Record<JobStage, string> = {
  aguardando: "border-line bg-paper text-muted",
  preparando: "border-warn/30 bg-accent-soft text-warn",
  imprimindo: "border-import/30 bg-import-soft text-import",
  acabamento: "border-accent-strong/30 bg-accent-soft text-accent-strong",
  concluido: "border-ok/30 bg-ok/10 text-ok",
  cancelado: "border-danger/30 bg-danger/10 text-danger",
};
export const JobStageBadge = ({ stage }: { stage: JobStage }) => <span className={cn(base, STAGE_TONE[stage])}>{JOB_STAGE_LABEL[stage]}</span>;

export const OverdueBadge = ({ days }: { days?: number }) => (
  <span className={cn(base, "border-danger/40 bg-danger/10 text-danger")} role="status">
    Atrasado{days && days > 0 ? ` · ${days} dia${days === 1 ? "" : "s"}` : ""}
  </span>
);
