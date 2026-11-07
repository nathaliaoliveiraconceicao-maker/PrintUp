import { describe, expect, it } from "vitest";
import { processAlerts } from "./alerts-runner";
import { runScheduled } from "./cron";
import { MemoryRepo } from "./repo-memory";
import { parseOrigin, resolveRedirect, UUID_RE } from "./redirect";
import { emailConfigured, sendEmail } from "@/lib/email";
import type { Source, Store } from "./repo";
import type { RawProduct } from "./connectors/types";

const NOW = new Date("2026-11-10T10:00:00Z");
const store: Store = { id: "s1", code: "simu", name: "Loja Simulada", kind: "simulado", allowedHosts: ["simulada.example.com"], reliability: 90, affiliateConfig: { params: { aff: "X" }, requiredParams: ["aff"] }, isSimulated: true, isActive: true };
const src = (over: Partial<Source> = {}): Source => ({ id: "src1", storeId: "s1", connector: "simulado", name: "Simulada", config: {}, frequencyMinutes: 1440, isActive: true, lastRunAt: null, ...over });
const env = { OFFERS_ALLOW_SIMULATED: "sim" };

describe("rotina agendada", () => {
  it("roda só fontes vencidas e ativas, expira o que ficou velho e devolve resumo", async () => {
    const repo = new MemoryRepo();
    repo.storeList = [store];
    repo.sourceList = [src(), src({ id: "src2", name: "Recente", lastRunAt: new Date(NOW.getTime() - 3_600_000) }), src({ id: "src3", name: "Desligada", isActive: false })];
    const r = await runScheduled({ repo, collector: { now: () => NOW, sleep: async () => {} }, alerts: null, env });
    expect(r.fontes.map((f) => f.fonte)).toEqual(["Simulada"]);
    expect(r.fontes[0].status).toBe("ok");
    expect(repo.offers.length).toBeGreaterThan(0);
    expect(repo.offers.every((o) => o.isSimulated)).toBe(true);
    expect(repo.offers.every((o) => o.status !== "publicada")).toBe(true); // publicação automática desligada
  });
  it("fonte sem credencial ou sem conector registra erro de configuração e segue", async () => {
    const repo = new MemoryRepo();
    repo.storeList = [{ ...store, isSimulated: false }];
    repo.sourceList = [src({ connector: "shopee", name: "Shopee" }), src({ id: "src2", connector: "simulado", name: "Sim" })];
    const r = await runScheduled({ repo, collector: { now: () => NOW, sleep: async () => {} }, alerts: null, env: {} });
    expect(r.fontes.map((f) => f.status)).toEqual(["falhou", "falhou"]);
    expect(repo.errors.some((e) => e.kind === "configuracao" && e.message.includes("SHOPEE_AFFILIATE_APP_ID"))).toBe(true);
    expect(repo.offers).toHaveLength(0);
  });
  it("respeita o orçamento de tempo", async () => {
    const repo = new MemoryRepo();
    repo.storeList = [store];
    repo.sourceList = [src(), src({ id: "src2", name: "B" })];
    let t = 0;
    const r = await runScheduled({ repo, collector: { now: () => NOW, sleep: async () => {} }, alerts: null, env, budgetMs: 10, clock: () => (t += 100) });
    expect(r.parou_por_tempo).toBe(true);
  });
  it("é idempotente: rodar de novo não duplica ofertas", async () => {
    const repo = new MemoryRepo();
    repo.storeList = [store];
    repo.sourceList = [src()];
    await runScheduled({ repo, collector: { now: () => NOW, sleep: async () => {} }, alerts: null, env });
    const n = repo.offers.length;
    repo.sourceList[0].lastRunAt = null;
    await runScheduled({ repo, collector: { now: () => NOW, sleep: async () => {} }, alerts: null, env });
    expect(repo.offers).toHaveLength(n);
  });
});

describe("alertas por e-mail", () => {
  const setup = () => {
    const repo = new MemoryRepo();
    repo.storeList = [store];
    repo.products = [{ id: "p1", storeId: "s1", externalId: "e", title: "Filamento PLA Marca 1kg", brand: "Marca", model: null, category: "filamento-pla", imageUrl: null, productUrl: "https://simulada.example.com/p", attrs: { weightG: 1000 }, canonicalKey: null, isSimulated: false }];
    repo.offers = [{ id: "o1", productId: "p1", status: "publicada", priceCents: 5500, previousPriceCents: 8000, previousBasis: "loja", discountPct: 31.3, couponId: null, couponSavedCents: 0, shippingCents: null, inStock: true, score: 85, scoreDetail: {}, flags: [], linkUrl: "https://simulada.example.com/p", isAffiliate: true, featured: false, validUntil: null, lastCheckedAt: NOW, reviewReason: null, reviewedAt: null, isSimulated: false }];
    repo.alerts = [{ id: "a1", userId: "u1", rule: { kind: "preco_abaixo", maxPricePerKgCents: 6000 }, channel: "email", cooldownHours: 24 }];
    const sent: { to: string; subject: string; text: string }[] = [];
    const deps = { repo, now: () => NOW, siteUrl: "https://printup.example", getEmail: async (id: string) => (id === "u1" ? "ana@exemplo.com" : null), send: async (m: { to: string; subject: string; text: string }) => { sent.push(m); return "enviada" as const; } };
    return { repo, sent, deps };
  };
  it("avisa quando o alerta casa e não repete o aviso", async () => {
    const { deps, sent, repo } = setup();
    expect((await processAlerts(deps)).enviados).toBe(1);
    expect(sent[0].to).toBe("ana@exemplo.com");
    expect(sent[0].text).toContain("https://printup.example/ir/o1?o=alerta");
    expect(sent[0].text).toContain("link de afiliado");
    expect((await processAlerts(deps)).enviados).toBe(0);
    expect(sent).toHaveLength(1);
    // preço cai mais de 5% e passou o intervalo: avisa de novo
    repo.offers[0].priceCents = 5000;
    expect((await processAlerts({ ...deps, now: () => new Date(NOW.getTime() + 2 * 86_400_000) })).enviados).toBe(0); // fora da janela de "recentes"
  });
  it("sem provedor de e-mail registra 'sem_provedor' (não finge que enviou)", async () => {
    const { deps, repo } = setup();
    const r = await processAlerts({ ...deps, send: async () => "sem_provedor" });
    expect(r).toMatchObject({ enviados: 0, sem_provedor: 1 });
    expect(repo.notifications[0].status).toBe("sem_provedor");
  });
  it("falha de envio é registrada e tentada de novo na próxima rodada", async () => {
    const { deps, repo } = setup();
    expect((await processAlerts({ ...deps, send: async () => "falhou" })).falhas).toBe(1);
    expect((await processAlerts(deps)).enviados).toBe(1);
    expect(repo.notifications.map((n) => n.status)).toEqual(["falhou", "enviada"]);
  });
  it("ignora canais ainda não suportados, usuário sem e-mail e oferta que não casa", async () => {
    const { deps, repo, sent } = setup();
    repo.alerts = [{ id: "a2", userId: "u1", rule: { kind: "preco_abaixo", maxPriceCents: 1000 }, channel: "email", cooldownHours: 24 }, { id: "a3", userId: "u1", rule: { kind: "preco_abaixo", maxPriceCents: 9000 }, channel: "whatsapp", cooldownHours: 24 }, { id: "a4", userId: "u2", rule: { kind: "preco_abaixo", maxPriceCents: 9000 }, channel: "email", cooldownHours: 24 }];
    expect((await processAlerts(deps)).enviados).toBe(0);
    expect(sent).toHaveLength(0);
  });
  it("voltou ao estoque dispara na transição", async () => {
    const { deps, repo } = setup();
    repo.alerts = [{ id: "a5", userId: "u1", rule: { kind: "voltou_estoque", query: "filamento" }, channel: "email", cooldownHours: 24 }];
    repo.observations.set("p1", [{ priceCents: 5500, inStock: false, source: "x", at: new Date(NOW.getTime() - 86_400_000) }, { priceCents: 5500, inStock: true, source: "x", at: NOW }]);
    expect((await processAlerts(deps)).enviados).toBe(1);
  });
});

describe("redirecionamento seguro", () => {
  const ok = { status: "publicada", link_url: "https://lojaa.com.br/p?aff=1" };
  const st = { is_active: true, allowed_hosts: ["lojaa.com.br"] };
  it("só vai para oferta publicada, loja ativa e host permitido", () => {
    expect(resolveRedirect(ok, st)).toBe("https://lojaa.com.br/p?aff=1");
    expect(resolveRedirect({ ...ok, status: "revisao" }, st)).toBeNull();
    expect(resolveRedirect(ok, { ...st, is_active: false })).toBeNull();
    expect(resolveRedirect({ ...ok, link_url: "https://evil.com/p" }, st)).toBeNull();
    expect(resolveRedirect({ ...ok, link_url: "http://lojaa.com.br/p" }, st)).toBeNull();
    expect(resolveRedirect({ ...ok, link_url: "javascript:alert(1)" }, st)).toBeNull();
    expect(resolveRedirect(null, st)).toBeNull();
  });
  it("id e origem são validados", () => {
    expect(UUID_RE.test("11111111-1111-1111-1111-111111111111")).toBe(true);
    expect(UUID_RE.test("../../etc/passwd")).toBe(false);
    expect(parseOrigin("alerta")).toBe("alerta");
    expect(parseOrigin("<script>")).toBe("site");
    expect(parseOrigin(null)).toBe("site");
  });
});

describe("envio de e-mail", () => {
  const msg = { to: "a@b.com", subject: "x", html: "<p>x</p>", text: "x" };
  it("sem provedor configurado não envia", async () => {
    expect(emailConfigured({})).toBe(false);
    expect(await sendEmail(msg, {})).toBe("sem_provedor");
  });
  it("com provedor: envia, e trata falha e destinatário inválido", async () => {
    const env = { RESEND_API_KEY: "k", EMAIL_FROM: "PrintUp <oi@printup.example>" };
    let body = "";
    expect(await sendEmail(msg, env, (async (_u: string, i: RequestInit) => { body = String(i.body); return new Response("{}"); }) as unknown as typeof fetch)).toBe("enviada");
    expect(JSON.parse(body).to).toEqual(["a@b.com"]);
    expect(await sendEmail(msg, env, (async () => new Response("", { status: 500 })) as unknown as typeof fetch)).toBe("falhou");
    expect(await sendEmail(msg, env, (async () => { throw new Error("rede"); }) as unknown as typeof fetch)).toBe("falhou");
    expect(await sendEmail({ ...msg, to: "invalido" }, env)).toBe("falhou");
  });
});
