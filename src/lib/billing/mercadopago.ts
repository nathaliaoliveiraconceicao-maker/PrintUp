import { hmacHex, safeEqual } from "./signature";
import {
  GatewayUnavailableError,
  type BillingGateway,
  type BillingCycle,
  type CanonicalEvent,
  type CheckoutRequest,
  type CheckoutResult,
  type GatewaySnapshot,
} from "./gateway";

const API = "https://api.mercadopago.com";

/** Token de teste do Mercado Pago começa com `TEST-`. Qualquer outro é tratado como PRODUÇÃO (bloqueado sem autorização). */
export const mercadoPagoIsTest = (token: string): boolean => token.startsWith("TEST-");

/** Texto de erro do gateway para o monitoramento: sem e-mails, sem sequências de números, sem quebras de linha, curto. */
export function sanitizeGatewayText(text: unknown): string {
  if (typeof text !== "string") return "";
  return text
    .replace(/\S+@\S+/g, "[e-mail]")
    .replace(/\d{4,}/g, "[n]")
    .replace(/[^\p{L}\p{N}\s.,:;()\-_\[\]]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

const testAccountCache = new Map<string, { ok: boolean; at: number }>();

/**
 * Credencial `APP_USR-` pode ser de uma conta de TESTE (usuário vendedor de teste, só dinheiro fictício) ou da conta REAL.
 * Pergunta ao Mercado Pago de quem é o token (`/users/me`) e só aceita se for conta de teste. Falha de rede = NÃO aceita.
 * O resultado fica em memória por alguns minutos (nunca grava o token em lugar nenhum).
 */
export async function mercadoPagoIsTestAccount(token: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const cached = testAccountCache.get(token);
  if (cached && Date.now() - cached.at < (cached.ok ? 600_000 : 30_000)) return cached.ok;
  let ok = false;
  try {
    const res = await fetchImpl(`${API}/users/me`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8_000), cache: "no-store" });
    if (res.ok) {
      const me = (await res.json()) as { nickname?: unknown; tags?: unknown };
      const tags = Array.isArray(me.tags) ? me.tags : [];
      ok = (typeof me.nickname === "string" && /^TESTUSER/i.test(me.nickname)) || tags.includes("test_user");
    }
  } catch {
    ok = false;
  }
  testAccountCache.set(token, { ok, at: Date.now() });
  return ok;
}

export interface MercadoPagoConfig {
  accessToken: string;
  /** Segredo da assinatura do webhook (painel de desenvolvedores). */
  webhookSecret: string;
  /** URL pública https do app (volta do checkout). */
  siteUrl: string;
  /** Só em teste: e-mail do comprador de teste (o Mercado Pago exige que combine com o usuário de teste). */
  testPayerEmail?: string;
  fetchImpl?: typeof fetch;
}

type Preapproval = {
  id: string;
  status?: string; // pending | authorized | paused | cancelled
  external_reference?: string;
  payer_id?: number | string;
  init_point?: string;
  date_created?: string;
  last_modified?: string;
  auto_recurring?: { transaction_amount?: number };
};
type AuthorizedPayment = {
  id: number | string;
  preapproval_id?: string;
  status?: string; // scheduled | processed | recycling | cancelled
  transaction_amount?: number;
  debit_date?: string;
  date_created?: string;
  last_modified?: string;
  payment?: { id?: number; status?: string; status_detail?: string };
};

const cents = (v: number | undefined) => (typeof v === "number" ? Math.round(v * 100) : undefined);
const iso = (v: string | undefined, fallback: string) => {
  const t = v ? new Date(v) : null;
  return t && !Number.isNaN(t.getTime()) ? t.toISOString() : fallback;
};

/**
 * Adaptador do Mercado Pago (assinaturas `/preapproval` sem plano associado, pagamento pendente → checkout hospedado).
 * O webhook do Mercado Pago traz só o ID do recurso: o estado é lido da API com a NOSSA chave, nunca do corpo recebido.
 */
export class MercadoPagoGateway implements BillingGateway {
  readonly id = "mercadopago";
  private readonly f: typeof fetch;
  constructor(private readonly cfg: MercadoPagoConfig) {
    this.f = cfg.fetchImpl ?? fetch;
  }

  private async call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T | null> {
    let res: Response;
    try {
      res = await this.f(`${API}${path}`, {
        method: init?.method ?? "GET",
        headers: { authorization: `Bearer ${this.cfg.accessToken}`, "content-type": "application/json" },
        body: init?.body ? JSON.stringify(init.body) : undefined,
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      });
    } catch {
      throw new GatewayUnavailableError("mercadopago_rede");
    }
    if (res.status === 404) return null;
    if (!res.ok) {
      // Só o código curto do erro (nunca o texto livre): ajuda a diagnosticar sem registrar dados pessoais.
      let code = "";
      let detail = "";
      try {
        const e = (await res.json()) as { error?: unknown; message?: unknown; cause?: { code?: unknown; description?: unknown }[] };
        const raw = String(e.cause?.[0]?.code ?? e.error ?? "");
        if (/^[A-Za-z0-9_]{1,40}$/.test(raw)) code = `_${raw}`;
        detail = sanitizeGatewayText(e.message) || sanitizeGatewayText(e.cause?.[0]?.description);
      } catch {
        // resposta sem JSON
      }
      throw new GatewayUnavailableError(`mercadopago_http_${res.status}${code}`, detail);
    }
    return (await res.json()) as T;
  }

  async createCheckout(req: CheckoutRequest): Promise<CheckoutResult> {
    // Vendedor de teste só cobra comprador de teste: se há e-mail @testuser.com configurado, ele é usado.
    // (Em produção de verdade essa variável não existe, e o e-mail é o de quem contrata.)
    const testPayer = this.cfg.testPayerEmail && /^[^@\s]+@testuser\.com$/i.test(this.cfg.testPayerEmail) ? this.cfg.testPayerEmail : null;
    const payerEmail = testPayer ?? req.customer.email;
    if (!payerEmail) throw new Error("sem_email");
    const months = req.cycle === "anual" ? 12 : 1;
    const r = await this.call<Preapproval>("/preapproval", {
      method: "POST",
      body: {
        reason: `PrintUp ${req.planName} (${req.cycle})`,
        external_reference: req.checkoutId,
        payer_email: payerEmail,
        back_url: `${this.cfg.siteUrl.replace(/\/$/, "")}/assinatura`,
        status: "pending",
        auto_recurring: { frequency: months, frequency_type: "months", transaction_amount: req.amountCents / 100, currency_id: "BRL" },
      },
    });
    if (!r?.init_point) throw new Error("sem_init_point");
    return { gatewayRef: r.id, url: r.init_point };
  }

  async cancelSubscription(id: string): Promise<void> {
    // O Mercado Pago só cancela de imediato (para de cobrar). O PrintUp mantém o plano até o fim do período já pago.
    await this.call(`/preapproval/${encodeURIComponent(id)}`, { method: "PUT", body: { status: "cancelled" } });
  }

  async changePlan(id: string, req: { amountCents: number; cycle: BillingCycle }): Promise<void> {
    const months = req.cycle === "anual" ? 12 : 1;
    await this.call(`/preapproval/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: { auto_recurring: { frequency: months, frequency_type: "months", transaction_amount: req.amountCents / 100, currency_id: "BRL" } },
    });
  }

  /** Formato oficial: cabeçalho `x-signature: ts=…,v1=…`; manifesto `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` (HMAC-SHA256 hex). */
  verifyWebhook(rawBody: string, headers: Headers): boolean {
    const secret = this.cfg.webhookSecret;
    const sig = headers.get("x-signature");
    if (!secret || secret.length < 16 || !sig) return false;
    const parts = Object.fromEntries(sig.split(",").map((p) => { const i = p.indexOf("="); return [p.slice(0, i).trim(), p.slice(i + 1).trim()]; }));
    if (!parts.ts || !parts.v1) return false;
    let dataId: string | undefined;
    try {
      const raw = (JSON.parse(rawBody) as { data?: { id?: unknown } }).data?.id;
      dataId = raw === undefined || raw === null ? undefined : String(raw).toLowerCase();
    } catch {
      return false;
    }
    const requestId = headers.get("x-request-id");
    const manifest = `${dataId !== undefined ? `id:${dataId};` : ""}${requestId ? `request-id:${requestId};` : ""}ts:${parts.ts};`;
    return safeEqual(hmacHex(secret, manifest), parts.v1.toLowerCase());
  }

  async parseWebhook(rawBody: string): Promise<CanonicalEvent[]> {
    const body = JSON.parse(rawBody) as { type?: string; topic?: string; data?: { id?: string | number } };
    const id = body.data?.id;
    if (id === undefined || id === null || !/^[A-Za-z0-9_-]{1,64}$/.test(String(id))) return [];
    const kind = body.type ?? body.topic;
    if (kind === "subscription_preapproval") return this.preapprovalEvents(String(id));
    if (kind === "subscription_authorized_payment") return this.paymentEvents(String(id));
    return []; // outros tópicos (payment, plan…) não mudam o plano
  }

  private async preapprovalEvents(id: string): Promise<CanonicalEvent[]> {
    const pa = await this.call<Preapproval>(`/preapproval/${encodeURIComponent(id)}`);
    if (!pa || pa.status !== "cancelled") return [];
    const at = iso(pa.last_modified, new Date().toISOString());
    return [{
      gateway: this.id, event_id: `mp:pa:${pa.id}:cancelled:${at}`, type: "subscription.canceled", occurred_at: at,
      gateway_subscription_id: pa.id, external_reference: pa.external_reference,
      gateway_customer_id: pa.payer_id !== undefined ? String(pa.payer_id) : undefined,
      cancel_at_period_end: true, // quem pagou até aqui mantém o acesso até o fim do período
    }];
  }

  private async paymentEvents(id: string): Promise<CanonicalEvent[]> {
    const ap = await this.call<AuthorizedPayment>(`/authorized_payments/${encodeURIComponent(id)}`);
    if (!ap?.preapproval_id) return [];
    const pa = await this.call<Preapproval>(`/preapproval/${encodeURIComponent(ap.preapproval_id)}`);
    return this.toEvents(ap, pa);
  }

  private toEvents(ap: AuthorizedPayment, pa: Preapproval | null): CanonicalEvent[] {
    const pay = ap.payment?.status;
    const at = iso(ap.last_modified ?? ap.date_created, new Date().toISOString());
    let type: CanonicalEvent["type"] | null = null;
    if (ap.status === "processed" && pay === "approved") type = "charge.confirmed";
    else if (pay === "rejected" || pay === "cancelled" || ap.status === "recycling") type = "charge.failed";
    else if (ap.status === "cancelled") type = "charge.canceled";
    if (!type) return []; // agendada/pendente: ainda sem efeito
    return [{
      gateway: this.id, event_id: `mp:ap:${ap.id}:${ap.status}:${pay ?? "-"}:${at}`, type, occurred_at: at,
      gateway_subscription_id: ap.preapproval_id, gateway_charge_id: String(ap.id),
      gateway_customer_id: pa?.payer_id !== undefined ? String(pa.payer_id) : undefined,
      external_reference: pa?.external_reference, amount_cents: cents(ap.transaction_amount), method: "cartao",
      paid_at: type === "charge.confirmed" ? at : undefined,
    }];
  }

  async fetchSnapshot(id: string): Promise<GatewaySnapshot | null> {
    const pa = await this.call<Preapproval>(`/preapproval/${encodeURIComponent(id)}`);
    if (!pa) return null;
    const list = await this.call<{ results?: AuthorizedPayment[] }>(`/authorized_payments/search?preapproval_id=${encodeURIComponent(id)}`);
    const charges: GatewaySnapshot["charges"] = [];
    for (const ap of list?.results ?? []) {
      const pay = ap.payment?.status;
      const status = ap.status === "processed" && pay === "approved" ? "recebida" : pay === "rejected" || ap.status === "recycling" ? "falhou" : ap.status === "cancelled" ? "cancelada" : "pendente";
      charges.push({ id: String(ap.id), status, amountCents: cents(ap.transaction_amount) ?? 0, method: "cartao", paidAt: status === "recebida" ? iso(ap.last_modified, new Date().toISOString()) : undefined, updatedAt: iso(ap.last_modified ?? ap.date_created, new Date().toISOString()) });
    }
    const status = pa.status === "cancelled" ? "cancelada" : pa.status === "paused" ? "inadimplente" : "ativa";
    return { status, cancelAtPeriodEnd: pa.status === "cancelled", charges };
  }
}
