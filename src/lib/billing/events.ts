import { z } from "zod";
import type { CanonicalEvent } from "./gateway";

const id = z.string().min(1).max(200);
const iso = z.string().max(40).refine((s) => !Number.isNaN(Date.parse(s)), "Data inválida");

/** Evento canônico vindo de um adaptador: validado antes de tocar no banco (tamanhos, tipos, datas). */
export const canonicalEventSchema = z.object({
  gateway: z.string().min(1).max(40),
  event_id: id,
  type: z.enum(["charge.confirmed", "charge.failed", "charge.overdue", "charge.refunded", "charge.canceled", "subscription.canceled"]),
  occurred_at: iso,
  gateway_customer_id: id.optional(),
  gateway_subscription_id: id.optional(),
  gateway_charge_id: id.optional(),
  external_reference: z.string().max(100).optional(),
  amount_cents: z.number().int().min(0).max(100_000_000).optional(),
  method: z.enum(["cartao", "pix", "boleto"]).optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  paid_at: iso.optional(),
  invoice_url: z.string().url().max(500).optional(),
  cancel_at_period_end: z.boolean().optional(),
});

export function parseCanonicalEvents(raw: unknown[]): { events: CanonicalEvent[]; invalid: number } {
  const events: CanonicalEvent[] = [];
  let invalid = 0;
  for (const r of raw) {
    const p = canonicalEventSchema.safeParse(r);
    if (p.success) events.push(p.data as CanonicalEvent);
    else invalid++;
  }
  return { events, invalid };
}

/** Eventos de reconciliação a partir do estado atual no gateway (ids sintéticos e estáveis: repetir não duplica). */
export function eventsFromSnapshot(
  gateway: string,
  gatewaySubscriptionId: string,
  snap: { status: "ativa" | "cancelada" | "inadimplente"; cancelAtPeriodEnd: boolean; charges: { id: string; status: string; amountCents: number; paidAt?: string; dueDate?: string; method?: "cartao" | "pix" | "boleto"; updatedAt: string }[] },
  now: Date = new Date(),
): CanonicalEvent[] {
  const map: Record<string, CanonicalEvent["type"] | undefined> = { recebida: "charge.confirmed", falhou: "charge.failed", vencida: "charge.overdue", estornada: "charge.refunded", cancelada: "charge.canceled" };
  const out: CanonicalEvent[] = [];
  for (const c of snap.charges) {
    const type = map[c.status];
    if (!type) continue;
    out.push({
      gateway, event_id: `recon:${c.id}:${c.status}`, type, occurred_at: c.updatedAt, gateway_subscription_id: gatewaySubscriptionId,
      gateway_charge_id: c.id, amount_cents: c.amountCents, method: c.method, due_date: c.dueDate, paid_at: c.paidAt,
    });
  }
  if (snap.status === "cancelada") {
    out.push({ gateway, event_id: `recon:${gatewaySubscriptionId}:cancelada`, type: "subscription.canceled", occurred_at: now.toISOString(), gateway_subscription_id: gatewaySubscriptionId });
  } else if (snap.cancelAtPeriodEnd) {
    out.push({ gateway, event_id: `recon:${gatewaySubscriptionId}:cancelamento_agendado`, type: "subscription.canceled", occurred_at: now.toISOString(), gateway_subscription_id: gatewaySubscriptionId, cancel_at_period_end: true });
  }
  return out;
}
