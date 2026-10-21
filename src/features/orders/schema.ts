import { z } from "zod";
import { PAYMENT_METHODS, type JobStage, type OrderStatus, type PaymentMethod, type PaymentStatus } from "./status";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");
const money = z.number({ error: "Informe um valor válido." }).min(0, "Valor inválido.").max(10_000_000, "Valor alto demais.");
const text = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));

export const orderItemSchema = z.object({
  kind: z.enum(["produto", "personalizacao"]),
  productId: z.uuid().nullish(),
  name: z.string().trim().min(1, "Dê um nome ao item.").max(160),
  description: text(1000),
  quantity: z.number().int("A quantidade deve ser inteira.").min(1, "Quantidade mínima: 1.").max(100_000),
  unitPrice: money,
  discountPercent: z.number().min(0).max(100),
});

export const saveOrderSchema = z
  .object({
    orderId: z.uuid().nullish(),
    customerId: z.uuid().nullish(),
    customer: z.object({ name: z.string().trim().min(1, "Informe o nome do cliente.").max(120), phone: text(30) }),
    dueDate: date.nullish(),
    paymentMethod: z.enum(PAYMENT_METHODS).nullish(),
    notes: text(2000),
    discount: z.object({ type: z.enum(["nenhum", "percentual", "valor"]), value: money }),
    items: z.array(orderItemSchema).min(1, "Adicione ao menos um item.").max(100),
  })
  .superRefine((v, ctx) => {
    if (v.discount.type === "percentual" && v.discount.value > 100) ctx.addIssue({ code: "custom", path: ["discount", "value"], message: "O desconto percentual vai até 100%." });
    v.items.forEach((it, i) => {
      if (it.kind === "produto" && !it.productId) ctx.addIssue({ code: "custom", path: ["items", i, "productId"], message: "Escolha o produto." });
    });
  });
export type SaveOrderPayload = z.input<typeof saveOrderSchema>;

export const paymentSchema = z.object({
  orderId: z.uuid(),
  kind: z.enum(["recebimento", "estorno"]),
  amount: z.number({ error: "Informe um valor válido." }).gt(0, "O valor deve ser maior que zero.").max(10_000_000),
  method: z.enum(PAYMENT_METHODS).nullish(),
  paidAt: date,
  note: text(300),
});

export type OrderActionState = { ok?: true; error?: string; orderId?: string; message?: string };

export interface OrderRow {
  id: string;
  number: number;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  quote_id: string | null;
  order_date: string;
  due_date: string | null;
  status: OrderStatus;
  payment_method: PaymentMethod | null;
  payment_status: PaymentStatus;
  amount_paid: number;
  subtotal: number;
  discount_total: number;
  total: number;
  estimated_cost: number | null;
  notes: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  created_at: string;
}
export interface OrderItemRow {
  id: string;
  order_id: string;
  position: number;
  kind: "produto" | "personalizacao";
  product_id: string | null;
  name: string;
  description: string | null;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  line_total: number;
  unit_cost: number | null;
  weight_g: number | null;
  print_minutes: number | null;
  printer_id: string | null;
  filament_id: string | null;
  needs_production: boolean;
}
export interface PaymentRow {
  id: string;
  order_id: string;
  kind: "recebimento" | "estorno";
  amount: number;
  method: PaymentMethod | null;
  paid_at: string;
  note: string | null;
}
export interface JobRow {
  id: string;
  order_id: string;
  order_item_id: string;
  product_name: string;
  quantity: number;
  printer_id: string | null;
  printer_name: string | null;
  filament_id: string | null;
  filament_name: string | null;
  stage: JobStage;
  est_grams: number | null;
  est_minutes: number | null;
  waste_percent: number;
  actual_grams: number | null;
  actual_minutes: number | null;
  failed_grams: number;
  failed_minutes: number;
  failed_count: number;
  real_material_cost: number | null;
  real_machine_cost: number | null;
  real_other_cost: number | null;
  failed_cost: number;
  notes: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export const ORDER_COLUMNS =
  "id, number, customer_id, customer_name, customer_phone, quote_id, order_date, due_date, status, payment_method, payment_status, amount_paid, subtotal, discount_total, total, estimated_cost, notes, delivered_at, cancelled_at, created_at";
export const ORDER_ITEM_COLUMNS =
  "id, order_id, position, kind, product_id, name, description, quantity, unit_price, discount_percent, line_total, unit_cost, weight_g, print_minutes, printer_id, filament_id, needs_production";
export const JOB_COLUMNS =
  "id, order_id, order_item_id, product_name, quantity, printer_id, printer_name, filament_id, filament_name, stage, est_grams, est_minutes, waste_percent, actual_grams, actual_minutes, failed_grams, failed_minutes, failed_count, real_material_cost, real_machine_cost, real_other_cost, failed_cost, notes, started_at, completed_at, created_at";
