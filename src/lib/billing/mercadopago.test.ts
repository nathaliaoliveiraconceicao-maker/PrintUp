import { describe, expect, it, vi } from "vitest";
import { GatewayUnavailableError } from "./gateway";
import { MercadoPagoGateway, mercadoPagoIsTest, mercadoPagoIsTestAccount, sanitizeGatewayText } from "./mercadopago";
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

  it("conta de teste com APP_USR-: usa o e-mail @testuser.com; e-mail comum nunca substitui o do cliente", async () => {
    const calls: Call[] = [];
    const mk = (testPayerEmail?: string) => new MercadoPagoGateway({ accessToken: "APP_USR-conta-teste", webhookSecret: SECRET, siteUrl: "https://app.exemplo.com.br", testPayerEmail, fetchImpl: (async (url: string, init?: RequestInit) => { calls.push({ url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined }); return new Response(JSON.stringify({ id: "p", init_point: "https://mp/x" }), { status: 200 }); }) as unknown as typeof fetch });
    const req = { checkoutId: "co", planCode: "pro", planName: "Pro", amountCents: 2990, cycle: "mensal" as const, customer: { userId: "u", email: "real@x.com", name: null } };
    await mk("TESTUSER1@testuser.com").createCheckout(req);
    await mk("pessoa@gmail.com").createCheckout(req);
    expect((calls[0].body as { payer_email: string }).payer_email).toBe("TESTUSER1@testuser.com");
    expect((calls[1].body as { payer_email: string }).payer_email).toBe("real@x.com");
  });

  it("erro do Mercado Pago vira motivo curto (status + código), sem texto livre", async () => {
    const gw = make({ "/preapproval": new Response(JSON.stringify({ error: "bad_request", message: "Cannot operate between different countries com dados@pessoais.com", cause: [{ code: 2000 }] }), { status: 400 }) });
    await expect(gw.createCheckout({ checkoutId: "co", planCode: "pro", planName: "Pro", amountCents: 2990, cycle: "mensal", customer: { userId: "u", email: "r@x.com", name: null } })).rejects.toThrow("mercadopago_http_400_2000");
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
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ nickname: "LOJA_REAL", tags: ["normal"] }), { status: 200 }));
    const { resolveGateway } = await import("./gateway");
    expect(await resolveGateway({ ...base, MERCADOPAGO_ACCESS_TOKEN: "APP_USR-1" })).toEqual({ enabled: false, reason: "cobranca_real_bloqueada" });
    vi.unstubAllGlobals();
    expect((await resolveGateway({ ...base, MERCADOPAGO_ACCESS_TOKEN: "TEST-1" })).enabled).toBe(true);
    expect((await resolveGateway({ ...base, MERCADOPAGO_ACCESS_TOKEN: "APP_USR-1", BILLING_ALLOW_LIVE: "sim" })).enabled).toBe(true);
  });
});

describe("mercadoPagoIsTestAccount (APP_USR- só vale se for conta de teste)", () => {
  const reply = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
  it("aceita conta de teste (TESTUSER ou tag test_user)", async () => {
    expect(await mercadoPagoIsTestAccount("APP_USR-teste-a", reply({ nickname: "TESTUSER123", tags: [] }))).toBe(true);
    expect(await mercadoPagoIsTestAccount("APP_USR-teste-b", reply({ nickname: "x", tags: ["normal", "test_user"] }))).toBe(true);
  });
  it("recusa conta real, resposta de erro e falha de rede (fecha por segurança)", async () => {
    expect(await mercadoPagoIsTestAccount("APP_USR-real", reply({ nickname: "MINHALOJA", tags: ["normal"] }))).toBe(false);
    expect(await mercadoPagoIsTestAccount("APP_USR-401", reply({ message: "invalid" }, 401))).toBe(false);
    expect(await mercadoPagoIsTestAccount("APP_USR-rede", (async () => { throw new Error("rede"); }) as unknown as typeof fetch)).toBe(false);
  });
});

describe("sanitizeGatewayText (texto de erro seguro para o monitoramento)", () => {
  it("remove e-mails e números longos e limita o tamanho", () => {
    expect(sanitizeGatewayText("Invalid payer_email ana@x.com for user 123456789")).toBe("Invalid payer_email [e-mail] for user [n]");
    expect(sanitizeGatewayText("a".repeat(500)).length).toBe(160);
    expect(sanitizeGatewayText({ x: 1 })).toBe("");
    expect(sanitizeGatewayText("linha1\nlinha2 <script>")).toBe("linha1 linha2 script");
  });
  it("o erro do gateway leva o detalhe sanitizado", async () => {
    const gw = make({ "/preapproval": new Response(JSON.stringify({ message: "Cannot operate between different countries para joao@x.com", status: 400 }), { status: 400 }) });
    await expect(gw.createCheckout({ checkoutId: "co", planCode: "pro", planName: "Pro", amountCents: 2990, cycle: "mensal", customer: { userId: "u", email: "r@x.com", name: null } })).rejects.toMatchObject({ message: "mercadopago_http_400", detail: "Cannot operate between different countries para [e-mail]" });
  });
});
