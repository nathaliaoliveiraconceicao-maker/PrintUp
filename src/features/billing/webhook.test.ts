import { describe, expect, it, vi } from "vitest";
import { SimulatedGateway } from "@/lib/billing/simulated";
import type { CanonicalEvent } from "@/lib/billing/gateway";
import { eventsFromSnapshot, parseCanonicalEvents } from "@/lib/billing/events";
import { handleBillingWebhook } from "./webhook";

const SECRET = "segredo-de-teste-com-mais-de-16-caracteres";
const gw = new SimulatedGateway(SECRET);
const ev = (over: Partial<CanonicalEvent> = {}): CanonicalEvent => ({ gateway: "simulado", event_id: "e1", type: "charge.confirmed", occurred_at: "2026-01-01T10:00:00Z", gateway_subscription_id: "sub_1", gateway_charge_id: "ch_1", amount_cents: 4990, ...over });
const req = (body: string, sig?: string, extra: Record<string, string> = {}) =>
  new Request("http://x/api/webhooks/billing", { method: "POST", body, headers: { "x-simulated-signature": sig ?? "", ...extra } });
const signed = (events: CanonicalEvent[]) => { const s = SimulatedGateway.sign(SECRET, events); return req(s.body, s.signature); };
const deps = (apply = vi.fn(async () => ({ result: "processado" }))) => ({ gateway: gw, apply, log: vi.fn() });

describe("webhook", () => {
  it("assinatura inválida: 401 e NADA é aplicado", async () => {
    const d = deps();
    const r = await handleBillingWebhook(req(JSON.stringify({ events: [ev()] }), "0".repeat(64)), d);
    expect(r.status).toBe(401);
    expect(d.apply).not.toHaveBeenCalled();
  });
  it("sem assinatura ou com corpo adulterado depois de assinado: 401", async () => {
    const d = deps();
    expect((await handleBillingWebhook(req(JSON.stringify({ events: [ev()] })), d)).status).toBe(401);
    const s = SimulatedGateway.sign(SECRET, [ev()]);
    expect((await handleBillingWebhook(req(s.body.replace("4990", "1"), s.signature), d)).status).toBe(401);
    expect(d.apply).not.toHaveBeenCalled();
  });
  it("assinatura válida: aplica o evento e responde 200", async () => {
    const d = deps();
    const r = await handleBillingWebhook(signed([ev()]), d);
    expect(r.status).toBe(200);
    expect(d.apply).toHaveBeenCalledTimes(1);
    expect(((await r.json()) as { results: { result: string }[] }).results[0].result).toBe("processado");
  });
  it("evento duplicado: o banco devolve 'duplicado' e o webhook responde 200 (sem erro para o gateway)", async () => {
    const d = deps(vi.fn(async () => ({ result: "duplicado" })));
    const r = await handleBillingWebhook(signed([ev(), ev()]), d);
    expect(r.status).toBe(200);
    expect(d.apply).toHaveBeenCalledTimes(2);
  });
  it("falha ao aplicar: 500 para o gateway reenviar", async () => {
    const d = deps(vi.fn(async () => { throw new Error("banco fora"); }));
    expect((await handleBillingWebhook(signed([ev()]), d)).status).toBe(500);
  });
  it("evento malformado (tipo desconhecido, valor negativo) é recusado antes do banco", async () => {
    const d = deps();
    const bad = { ...ev(), type: "charge.mágica", amount_cents: -5 } as unknown as CanonicalEvent;
    expect((await handleBillingWebhook(signed([bad]), d)).status).toBe(400);
    expect(d.apply).not.toHaveBeenCalled();
  });
  it("corpo gigante: 413; JSON inválido assinado: 400; gateway desligado: 503", async () => {
    const d = deps();
    expect((await handleBillingWebhook(req("x".repeat(300_000), "a"), d)).status).toBe(413);
    const sig = SimulatedGateway.sign(SECRET, []).signature;
    void sig;
    const raw = "isto não é json";
    const r = new Request("http://x", { method: "POST", body: raw, headers: { "x-simulated-signature": (await import("@/lib/billing/signature")).hmacHex(SECRET, raw) } });
    expect((await handleBillingWebhook(r, d)).status).toBe(400);
    expect((await handleBillingWebhook(signed([ev()]), { ...d, gateway: null })).status).toBe(503);
  });
  it("o log nunca recebe o payload (só ids e resultado)", async () => {
    const d = deps();
    await handleBillingWebhook(signed([ev({ gateway_customer_id: "cus_secreto" })]), d);
    expect(JSON.stringify(d.log.mock.calls)).not.toMatch(/cus_secreto|4990|segredo/);
  });
  it("o gateway do evento é sempre o do adaptador (não o que o payload alega)", async () => {
    const d = deps();
    await handleBillingWebhook(signed([ev({ gateway: "outro" })]), d);
    expect((d.apply.mock.calls[0] as unknown as [CanonicalEvent])[0].gateway).toBe("simulado");
  });
});

describe("eventos canônicos e reconciliação", () => {
  it("valida campos", () => {
    expect(parseCanonicalEvents([ev(), { nada: true }]).invalid).toBe(1);
    expect(parseCanonicalEvents([ev({ occurred_at: "ontem" })]).events).toHaveLength(0);
  });
  it("snapshot do gateway vira eventos com ids estáveis (reconciliar duas vezes não duplica)", () => {
    const snap = { status: "ativa" as const, cancelAtPeriodEnd: true, charges: [{ id: "c1", status: "recebida", amountCents: 100, paidAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }, { id: "c2", status: "falhou", amountCents: 100, updatedAt: "2026-02-01T00:00:00Z" }] };
    const a = eventsFromSnapshot("g", "sub", snap);
    const b = eventsFromSnapshot("g", "sub", snap);
    expect(a.map((e) => e.event_id)).toEqual(b.map((e) => e.event_id));
    expect(a.map((e) => e.type)).toEqual(["charge.confirmed", "charge.failed", "subscription.canceled"]);
    expect(a[2].cancel_at_period_end).toBe(true);
  });
});
