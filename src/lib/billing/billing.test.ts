import { describe, expect, it } from "vitest";
import { resolveGateway, simulatorAllowed } from "./gateway";
import { hmacHex, safeEqual, verifyHmac } from "./signature";
import { SimulatedGateway } from "./simulated";
import { featureMessage, isPaidAccess, limitText, needsAttention, percentUsed } from "./state";

const SECRET = "segredo-de-teste-com-mais-de-16-caracteres";

describe("assinatura do webhook", () => {
  it("aceita só o HMAC correto do corpo bruto", () => {
    const body = '{"events":[]}';
    const sig = hmacHex(SECRET, body);
    expect(verifyHmac(SECRET, body, sig)).toBe(true);
    expect(verifyHmac(SECRET, body, sig.toUpperCase())).toBe(true);
    expect(verifyHmac(SECRET, body + " ", sig)).toBe(false); // corpo alterado
    expect(verifyHmac(SECRET, body, hmacHex("outro-segredo-qualquer-123", body))).toBe(false);
    expect(verifyHmac(SECRET, body, null)).toBe(false);
    expect(verifyHmac(SECRET, body, "")).toBe(false);
  });
  it("sem segredo configurado (ou fraco) nada é aceito", () => {
    const body = "{}";
    expect(verifyHmac(undefined, body, hmacHex("x", body))).toBe(false);
    expect(verifyHmac("curto", body, hmacHex("curto", body))).toBe(false);
  });
  it("comparação em tempo constante recusa tamanhos diferentes", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

describe("gateway simulado", () => {
  const gw = new SimulatedGateway(SECRET);
  it("verifica a assinatura enviada no cabeçalho", () => {
    const { body, signature } = SimulatedGateway.sign(SECRET, [{ gateway: "simulado", event_id: "e1", type: "charge.confirmed", occurred_at: "2026-01-01T00:00:00Z" }]);
    expect(gw.verifyWebhook(body, new Headers({ "x-simulated-signature": signature }))).toBe(true);
    expect(gw.verifyWebhook(body, new Headers({ "x-simulated-signature": "0".repeat(64) }))).toBe(false);
    expect(gw.verifyWebhook(body, new Headers())).toBe(false);
    expect(gw.parseWebhook(body)).toHaveLength(1);
  });
  it("corpo que não é JSON não vira evento nem derruba", () => {
    expect(() => gw.parseWebhook("não é json")).toThrow();
    expect(gw.parseWebhook('{"events":"x"}')).toEqual([]);
  });
});

describe("o simulador nunca roda em produção", () => {
  it("regra por ambiente", () => {
    expect(simulatorAllowed({ BILLING_GATEWAY: "simulado" })).toBe(true);
    expect(simulatorAllowed({ BILLING_GATEWAY: "simulado", VERCEL_ENV: "preview" })).toBe(true);
    expect(simulatorAllowed({ BILLING_GATEWAY: "simulado", VERCEL_ENV: "production" })).toBe(false);
    expect(simulatorAllowed({})).toBe(false);
  });
  it("sem chave de servidor ou sem gateway aprovado, contratar fica desabilitado", async () => {
    expect(await resolveGateway({})).toEqual({ enabled: false, reason: "sem_chave_servidor" });
    expect(await resolveGateway({ SUPABASE_SERVICE_ROLE_KEY: "k" })).toEqual({ enabled: false, reason: "sem_gateway" });
    expect(await resolveGateway({ SUPABASE_SERVICE_ROLE_KEY: "k", BILLING_GATEWAY: "simulado", VERCEL_ENV: "production" })).toEqual({ enabled: false, reason: "simulador_bloqueado" });
    const ok = await resolveGateway({ SUPABASE_SERVICE_ROLE_KEY: "k", BILLING_GATEWAY: "simulado", BILLING_WEBHOOK_SECRET: SECRET });
    expect(ok.enabled).toBe(true);
  });
});

describe("estados e limites", () => {
  it("acesso pago e atenção", () => {
    expect(isPaidAccess("ativo")).toBe(true);
    expect(isPaidAccess("em_teste")).toBe(true);
    expect(isPaidAccess("cancelamento_agendado")).toBe(true);
    expect(isPaidAccess("inadimplente")).toBe(false);
    expect(isPaidAccess("gratuito")).toBe(false);
    expect(needsAttention("pagamento_pendente")).toBe(true);
    expect(needsAttention("ativo")).toBe(false);
  });
  it("uso dos limites", () => {
    expect(percentUsed(3, 6)).toBe(50);
    expect(percentUsed(9, 6)).toBe(100);
    expect(percentUsed(1, null)).toBeNull();
    expect(percentUsed(0, 0)).toBe(0);
    expect(percentUsed(2, 0)).toBe(100);
    expect(limitText(null)).toBe("Ilimitado");
    expect(limitText(200)).toBe("200");
  });
  it("mensagem de recurso fora do plano", () => {
    expect(featureMessage("orders")).toMatch(/Gestão de pedidos/);
    expect(featureMessage("desconhecido")).toMatch(/Este recurso/);
  });
});
