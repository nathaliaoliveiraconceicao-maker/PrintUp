/**
 * Contrato entre o PrintUp e o gateway de pagamento. Só UM adaptador é usado por vez (`BILLING_GATEWAY`).
 * O resto do app fala apenas com estes tipos: trocar de gateway é escrever outro adaptador.
 */
export type BillingCycle = "mensal" | "anual";
export type PaymentMethodKind = "cartao" | "pix" | "boleto";

export type CanonicalEventType =
  | "charge.confirmed"
  | "charge.failed"
  | "charge.overdue"
  | "charge.refunded"
  | "charge.canceled"
  | "subscription.canceled";

/** Evento já traduzido para a linguagem do PrintUp (o que a função SQL `apply_billing_event` consome). */
export interface CanonicalEvent {
  gateway: string;
  event_id: string;
  type: CanonicalEventType;
  occurred_at: string;
  gateway_customer_id?: string;
  gateway_subscription_id?: string;
  gateway_charge_id?: string;
  /** Id do checkout criado pelo PrintUp (é daqui que sai o usuário e o plano — nunca do payload). */
  external_reference?: string;
  amount_cents?: number;
  method?: PaymentMethodKind;
  due_date?: string;
  paid_at?: string;
  invoice_url?: string;
  cancel_at_period_end?: boolean;
}

export interface CheckoutRequest {
  checkoutId: string;
  planCode: string;
  planName: string;
  amountCents: number;
  cycle: BillingCycle;
  gatewayPriceId?: string;
  customer: { userId: string; email: string | null; name: string | null };
}
export interface CheckoutResult { gatewayRef: string; url: string }

export interface GatewaySnapshot {
  status: "ativa" | "cancelada" | "inadimplente";
  cancelAtPeriodEnd: boolean;
  charges: { id: string; status: "recebida" | "falhou" | "vencida" | "estornada" | "pendente" | "cancelada"; amountCents: number; paidAt?: string; dueDate?: string; method?: PaymentMethodKind; updatedAt: string }[];
}

export interface BillingGateway {
  readonly id: string;
  /** Cria a cobrança recorrente no gateway e devolve a URL onde o cliente paga. */
  createCheckout(req: CheckoutRequest): Promise<CheckoutResult>;
  /** Cancela a recorrência (`atPeriodEnd` mantém o plano até o fim do período já pago). */
  cancelSubscription(gatewaySubscriptionId: string, atPeriodEnd: boolean): Promise<void>;
  /** Troca o valor da recorrência (upgrade/downgrade). */
  changePlan(gatewaySubscriptionId: string, req: { planCode: string; amountCents: number; cycle: BillingCycle; gatewayPriceId?: string }): Promise<void>;
  /** Autenticidade: confere a assinatura/token no corpo BRUTO. */
  verifyWebhook(rawBody: string, headers: Headers): boolean;
  parseWebhook(rawBody: string): CanonicalEvent[];
  /** Situação atual no gateway, para reconciliação (webhooks podem se perder). */
  fetchSnapshot(gatewaySubscriptionId: string): Promise<GatewaySnapshot | null>;
}

/** O simulador só existe fora de produção: `VERCEL_ENV=production` nunca o aceita, mesmo com a variável ligada. */
export function simulatorAllowed(env: Record<string, string | undefined>): boolean {
  return env.BILLING_GATEWAY === "simulado" && env.VERCEL_ENV !== "production";
}

export type GatewayStatus =
  | { enabled: true; gateway: BillingGateway }
  | { enabled: false; reason: "sem_gateway" | "sem_chave_servidor" | "simulador_bloqueado" };

/** Nenhum gateway real foi aprovado ainda: em produção, contratar fica desabilitado (sem cobrança real). */
export async function resolveGateway(env: Record<string, string | undefined> = process.env): Promise<GatewayStatus> {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) return { enabled: false, reason: "sem_chave_servidor" };
  if (env.BILLING_GATEWAY === "simulado") {
    if (!simulatorAllowed(env)) return { enabled: false, reason: "simulador_bloqueado" };
    const { SimulatedGateway } = await import("./simulated");
    return { enabled: true, gateway: new SimulatedGateway(env.BILLING_WEBHOOK_SECRET) };
  }
  return { enabled: false, reason: "sem_gateway" };
}
