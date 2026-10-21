import { describe, expect, it } from "vitest";
import { GatewayUnavailableError } from "./gateway";
import { MercadoPagoGateway, mercadoPagoIsTest } from "./mercadopago";
import { hmacHex } from "./signature";

const SECRET = "segredo-mp-de-teste-0123456789";
type Call = { url: string; method: string; body?: unknown };

function make(routes: Record<string, unknown>, calls: Call[] = []) {
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const path = url.replace("https://api.mercadopago.com", "");
    calls.push({ url: path, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (!(path in routes)) return new Response("{}", { status: 404 });
    const r = routes[path];
    return r instanceof Response ? r : new Response(JSON.stringify(r), { status: 200 });
  }) as unknown as typeof fetch;
  return new MercadoPagoGateway({ accessToken: "TEST-abc", webhookSecret: SECRET, siteUrl: "https://app.exemplo.com.br/", testPayerEmail: "comprador@testuser.com", fetchImpl });
}

function signed(dataId: string, requestId = "req-1", ts = "1742505638683", secret = SECRET) {
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const body = JSON.stringify({ type: "subscription_authorized_payment", data: { id: dataId } });
  return { body, headers: new Headers({ "x-signature": `ts=${ts},v1=${hmacHex(secret, manifest)}`, "x-request-id": requestId }) };
}

describe("Mercado Pago", () => {
  it("só trata TEST- como credencial de teste", () => {
    expect(mercadoPagoIsTest("TEST-123")).toBe(true);
    expect(mercadoPagoIsTest("APP_USR-123")).toBe(false);
  });

  it("verifica a assinatura x-signature; recusa corpo/segredo/ts adulterados", () => {
    const gw = make({});
    const ok = signed("ABC123");
    expect(gw.verifyWebhook(ok.body, ok.headers)).toBe(true);
    expect(gw.verifyWebhook(signed("ABC123", "req-1", "1", "outro-segredo-qualquer-123").body, signed("ABC123", "req-1", "1", "outro-segredo-qualquer-123").headers)).toBe(false);
    expect(gw.verifyWebhook(ok.body.replace("ABC123", "XYZ"), ok.headers)).toBe(false);
    const h = new Headers(ok.headers);
    h.set("x-request-id", "outro");
    expect(gw.verifyWebhook(ok.body, h)).toBe(false);
    expect(gw.verifyWebhook(ok.body, new Headers())).toBe(false);
    expect(gw.verifyWebhook("não é json", ok.headers)).toBe(false);
  });

  it("cria assinatura pendente com o e-mail de teste e devolve o link de pagamento", async () => {
    const calls: Call[] = [];
    const gw = make({ "/preapproval": { id: "pre1", init_point: "https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=pre1" } }, calls);
    const r = await gw.createCheckout({ checkoutId: "co-1", planCode: "pro", planName: "Pro", amountCents: 4990, cycle: "mensal", customer: { userId: "u", email: "real@x.com", name: null } });
    expect(r).toEqual({ gatewayRef: "pre1", url: expect.stringContaining("mercadopago") });
    const b = calls[0].body as Record<string, unknown>;
    expect(b).toMatchObject({ status: "pending", external_reference: "co-1", payer_email: "comprador@testuser.com", back_url: "https://app.exemplo.com.br/assinatura" });
    expect(b.auto_recurring).toMatchObject({ frequency: 1, frequency_type: "months", transaction_amount: 49.9, currency_id: "BRL" });
  });

  it("pagamento aprovado vira charge.confirmed com o checkout vindo da API (não do corpo)", async () => {
    const gw = make({
      "/authorized_payments/77": { id: 77, preapproval_id: "pre1", status: "processed", transaction_amount: 49.9, last_modified: "2026-10-21T10:00:00.000Z", payment: { status: "approved" } },
      "/preapproval/pre1": { id: "pre1", external_reference: "co-1", payer_id: 555 },
    });
    const ev = await gw.parseWebhook(JSON.stringify({ type: "subscription_authorized_payment", data: { id: "77" }, external_reference: "FORJADO" }));
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ type: "charge.confirmed", external_reference: "co-1", gateway_subscription_id: "pre1", gateway_charge_id: "77", amount_cents: 4990, gateway_customer_id: "555" });
  });

  it("recusado → charge.failed; agendado → sem evento; assinatura cancelada → cancelamento no fim do período", async () => {
    const gw = make({
      "/authorized_payments/1": { id: 1, preapproval_id: "p", status: "recycling", payment: { status: "rejected" }, last_modified: "2026-10-21T10:00:00Z" },
      "/authorized_payments/2": { id: 2, preapproval_id: "p", status: "scheduled" },
      "/preapproval/p": { id: "p", status: "cancelled", external_reference: "co", last_modified: "2026-10-21T11:00:00Z" },
    });
    expect((await gw.parseWebhook(JSON.stringify({ type: "subscription_authorized_payment", data: { id: "1" } })))[0].type).toBe("charge.failed");
    expect(await gw.parseWebhook(JSON.stringify({ type: "subscription_authorized_payment", data: { id: "2" } }))).toEqual([]);
    expect((await gw.parseWebhook(JSON.stringify({ type: "subscription_preapproval", data: { id: "p" } })))[0]).toMatchObject({ type: "subscription.canceled", cancel_at_period_end: true });
  });

  it("ignora tópicos desconhecidos e ids suspeitos; erro do gateway vira indisponível (500 → reenvio)", async () => {
    const gw = make({ "/preapproval/x": new Response("boom", { status: 503 }) });
    expect(await gw.parseWebhook(JSON.stringify({ type: "payment", data: { id: "1" } }))).toEqual([]);
    expect(await gw.parseWebhook(JSON.stringify({ type: "subscription_preapproval", data: { id: "../../x" } }))).toEqual([]);
    await expect(gw.parseWebhook(JSON.stringify({ type: "subscription_preapproval", data: { id: "x" } }))).rejects.toBeInstanceOf(GatewayUnavailableError);
  });

  it("cancelar e trocar valor usam PUT no recurso", async () => {
    const calls: Call[] = [];
    const gw = make({ "/preapproval/p": {} }, calls);
    await gw.cancelSubscription("p");
    await gw.changePlan("p", { amountCents: 9990, cycle: "anual" });
    expect(calls[0]).toMatchObject({ method: "PUT", body: { status: "cancelled" } });
    expect(calls[1].body).toMatchObject({ auto_recurring: { frequency: 12, transaction_amount: 99.9 } });
  });
});

describe("resolveGateway com Mercado Pago", () => {
  const base = { SUPABASE_SERVICE_ROLE_KEY: "x".repeat(30), BILLING_GATEWAY: "mercadopago", MERCADOPAGO_WEBHOOK_SECRET: SECRET, NEXT_PUBLIC_SITE_URL: "https://app.exemplo.com.br" };
  it("exige token, segredo e URL", async () => {
    const { resolveGateway } = await import("./gateway");
    expect(await resolveGateway({ ...base })).toEqual({ enabled: false, reason: "mercadopago_incompleto" });
    expect(await resolveGateway({ ...base, MERCADOPAGO_ACCESS_TOKEN: "TEST-1", MERCADOPAGO_WEBHOOK_SECRET: "curto" })).toEqual({ enabled: false, reason: "mercadopago_incompleto" });
  });
  it("credencial de produção fica bloqueada sem autorização explícita", async () => {
    const { resolveGateway } = await import("./gateway");
    expect(await resolveGateway({ ...base, MERCADOPAGO_ACCESS_TOKEN: "APP_USR-1" })).toEqual({ enabled: false, reason: "cobranca_real_bloqueada" });
    expect((await resolveGateway({ ...base, MERCADOPAGO_ACCESS_TOKEN: "TEST-1" })).enabled).toBe(true);
    expect((await resolveGateway({ ...base, MERCADOPAGO_ACCESS_TOKEN: "APP_USR-1", BILLING_ALLOW_LIVE: "sim" })).enabled).toBe(true);
  });
});
