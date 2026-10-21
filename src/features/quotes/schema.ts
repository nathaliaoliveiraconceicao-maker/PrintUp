import { z } from "zod";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");
const money = z.number().min(0, "Valor inválido.").max(10_000_000, "Valor alto demais.");
const text = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));

export const quoteItemSchema = z.object({
  kind: z.enum(["produto", "personalizacao"]),
  productId: z.uuid().nullish(),
  /** Para `produto`, o servidor usa o nome do cadastro; aqui só vale para personalização. */
  name: z.string().trim().min(1, "Dê um nome ao item.").max(160),
  description: text(1000),
  quantity: z.number().int("A quantidade deve ser inteira.").min(1, "Quantidade mínima: 1.").max(100_000),
  unitPrice: money,
  discountPercent: z.number().min(0).max(100, "O desconto da linha vai até 100%."),
});

export const saveQuoteSchema = z
  .object({
    quoteId: z.uuid().nullish(),
    customerId: z.uuid().nullish(),
    /** Guardar este cliente na lista para os próximos orçamentos. */
    saveCustomer: z.boolean().optional(),
    customer: z.object({
      name: z.string().trim().min(1, "Informe o nome do cliente.").max(120),
      phone: text(30),
      email: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().max(160).optional()),
      document: text(30),
    }),
    validUntil: date,
    productionDays: z.number().int().min(0).max(365).nullish(),
    paymentTerms: text(1000),
    notes: text(2000),
    discount: z.object({ type: z.enum(["nenhum", "percentual", "valor"]), value: money }),
    items: z.array(quoteItemSchema).min(1, "Adicione ao menos um item.").max(100, "No máximo 100 itens por orçamento."),
  })
  .superRefine((v, ctx) => {
    if (v.discount.type === "percentual" && v.discount.value > 100) {
      ctx.addIssue({ code: "custom", path: ["discount", "value"], message: "O desconto percentual vai até 100%." });
    }
    v.items.forEach((it, i) => {
      if (it.kind === "produto" && !it.productId) ctx.addIssue({ code: "custom", path: ["items", i, "productId"], message: "Escolha o produto." });
    });
  });

export type SaveQuotePayload = z.input<typeof saveQuoteSchema>;
export type QuoteActionState = { ok?: true; error?: string; quoteId?: string; message?: string; url?: string };

export interface QuoteRow {
  id: string;
  number: number;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  customer_document: string | null;
  status: "rascunho" | "enviado" | "aprovado" | "recusado" | "expirado";
  issue_date: string;
  valid_until: string;
  production_days: number | null;
  payment_terms: string | null;
  notes: string | null;
  discount_type: "nenhum" | "percentual" | "valor";
  discount_value: number;
  subtotal: number;
  discount_total: number;
  total: number;
  internal_cost_total: number | null;
  share_path: string | null;
  shared_at: string | null;
  sent_at: string | null;
  decided_at: string | null;
  created_at: string;
}

export interface QuoteItemRow {
  id: string;
  quote_id: string;
  position: number;
  kind: "produto" | "personalizacao";
  product_id: string | null;
  name: string;
  description: string | null;
  photo_path: string | null;
  quantity: number;
  list_price: number | null;
  unit_price: number;
  discount_percent: number;
  line_total: number;
  unit_cost: number | null;
}

export const QUOTE_COLUMNS =
  "id, number, customer_id, customer_name, customer_phone, customer_email, customer_document, status, issue_date, valid_until, production_days, payment_terms, notes, discount_type, discount_value, subtotal, discount_total, total, internal_cost_total, share_path, shared_at, sent_at, decided_at, created_at";
export const ITEM_COLUMNS =
  "id, quote_id, position, kind, product_id, name, description, photo_path, quantity, list_price, unit_price, discount_percent, line_total, unit_cost";
