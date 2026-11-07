import { describe, expect, it } from "vitest";
import { runSource, sweepExpired } from "./collector";
import { feedConnector, parseFeedText, parseCsv } from "./connectors/feed";
import { itemToProduct, mercadoLivreConnector } from "./connectors/mercadolivre";
import { nodeToProduct, shopeeAuthHeader, shopeeConnector } from "./connectors/shopee";
import { ConnectorError, type RawProduct, type StoreConnector } from "./connectors/types";
import { connectorFor } from "./connectors/registry";
import { MemoryRepo } from "./repo-memory";
import type { Source, Store } from "./repo";

const store: Store = { id: "s1", code: "lojaa", name: "Loja A", kind: "afiliado", allowedHosts: ["lojaa.com.br"], reliability: 95, affiliateConfig: { params: { aff: "MEUID" }, requiredParams: ["aff"] }, isSimulated: false, isActive: true };
const source: Source = { id: "src1", storeId: "s1", connector: "feed_manual", name: "Feed", config: {}, frequencyMinutes: 1440, isActive: true, lastRunAt: null };
const T0 = new Date("2026-11-01T10:00:00Z");
const at = (days: number) => new Date(T0.getTime() + days * 86_400_000);

const pla = (over: Partial<RawProduct> = {}): RawProduct => ({ externalId: "pla1", title: "Filamento PLA Marca X 1kg 1.75mm", brand: "Marca X", imageUrl: "https://img.lojaa.com.br/a.jpg", productUrl: "https://lojaa.com.br/pla1?utm_source=zzz", priceCents: 7000, inStock: true, ...over });
const noSleep = async () => {};
const run = (repo: MemoryRepo, items: RawProduct[], day = 0, s: Store = store) => runSource({ repo, now: () => at(day), sleep: noSleep }, s, source, "importacao", items);

describe("importação e atualização de produtos", () => {
  it("importa produtos e cria oferta em revisão no primeiro registro", async () => {
    const repo = new MemoryRepo();
    const r = await run(repo, [pla({ declaredPreviousCents: 10000 })]);
    expect(r.status).toBe("ok");
    expect(r.stats).toMatchObject({ vistos: 1, novos_produtos: 1, ofertas_criadas: 1, em_revisao: 1 });
    expect(repo.products[0]).toMatchObject({ category: "filamento-pla", productUrl: "https://lojaa.com.br/pla1", canonicalKey: expect.stringContaining("PLA") });
    expect(repo.offers[0]).toMatchObject({ status: "revisao", previousBasis: "loja", discountPct: 30, isAffiliate: true });
    expect(repo.offers[0].linkUrl).toContain("aff=MEUID");
    expect(repo.offers[0].flags).toContain("primeiro_registro");
  });
  it("atualiza preços e mantém UMA oferta aberta (sem duplicar)", async () => {
    const repo = new MemoryRepo();
    await run(repo, [pla()], 0);
    await run(repo, [pla({ priceCents: 6500 })], 1);
    await run(repo, [pla({ priceCents: 6500 })], 1);
    expect(repo.offers).toHaveLength(1);
    expect(repo.offers[0].priceCents).toBe(6500);
    expect(repo.observations.get(repo.products[0].id)).toHaveLength(2); // mesmo preço no mesmo instante não duplica
  });
  it("não inventa preço anterior, desconto nem cupom", async () => {
    const repo = new MemoryRepo();
    await run(repo, [pla()]);
    expect(repo.offers[0]).toMatchObject({ previousPriceCents: null, previousBasis: null, discountPct: null, couponId: null, couponSavedCents: 0 });
  });
  it("ignora o que não é de impressão 3D, preço absurdo e destino fora da lista", async () => {
    const repo = new MemoryRepo();
    const r = await run(repo, [pla({ externalId: "x", title: "Tênis esportivo" }), pla({ externalId: "y", priceCents: 5 }), pla({ externalId: "z", productUrl: "https://evil.com/p" })]);
    expect(r.stats.ignorados).toBe(3);
    expect(repo.offers).toHaveLength(0);
    expect(repo.errors.some((e) => e.kind === "destino_nao_permitido")).toBe(true);
  });
  it("sem link de afiliado configurado: link comum e vai para revisão", async () => {
    const repo = new MemoryRepo();
    await run(repo, [pla()], 0, { ...store, affiliateConfig: {} });
    expect(repo.offers[0]).toMatchObject({ isAffiliate: false });
    expect(repo.offers[0].flags).toContain("sem_link_afiliado");
    expect(repo.offers[0].status).toBe("revisao");
  });
  it("aceita link de afiliado pronto só com destino permitido", async () => {
    const repo = new MemoryRepo();
    await run(repo, [pla({ externalId: "a", affiliateUrl: "https://lojaa.com.br/pla1?aff=PORTAL" }), pla({ externalId: "b", affiliateUrl: "https://outra.com/p?aff=1" })]);
    expect(repo.offers.find((o) => o.linkUrl.includes("PORTAL"))).toBeTruthy();
    expect(repo.offers.every((o) => o.linkUrl.startsWith("https://lojaa.com.br/"))).toBe(true);
  });
  it("loja simulada gera ofertas marcadas como simuladas", async () => {
    const repo = new MemoryRepo();
    await run(repo, [pla()], 0, { ...store, isSimulated: true });
    expect(repo.offers[0].isSimulated).toBe(true);
    expect(repo.products[0].isSimulated).toBe(true);
  });
});

describe("cupons", () => {
  const coupon = { id: "c1", storeId: "s1", code: "PRINT10", kind: "percent" as const, value: 10, isActive: true, source: "loja", validUntil: at(30) };
  it("aplica cupom válido cadastrado", async () => {
    const repo = new MemoryRepo();
    repo.couponList = [coupon];
    await run(repo, [pla()]);
    expect(repo.offers[0]).toMatchObject({ couponId: "c1", couponSavedCents: 700 });
  });
  it("cupom vencido ou sem origem não é usado", async () => {
    const repo = new MemoryRepo();
    repo.couponList = [{ ...coupon, validUntil: at(-1) }, { ...coupon, id: "c2", code: "SEMORIGEM", source: "" }];
    await run(repo, [pla()]);
    expect(repo.offers[0].couponId).toBeNull();
  });
});

describe("publicação automática e revisão", () => {
  const seed = async (repo: MemoryRepo) => {
    // histórico observado: 6 observações em 10 dias a ~R$ 100
    for (let d = 0; d <= 10; d += 2) await run(repo, [pla({ priceCents: 10000 + (d % 3) * 50 })], d);
  };
  it("com a publicação automática DESLIGADA nada é publicado sozinho", async () => {
    const repo = new MemoryRepo();
    await seed(repo);
    await run(repo, [pla({ priceCents: 7000, declaredPreviousCents: 10000 })], 12);
    expect(repo.offers.filter((o) => o.status === "publicada")).toHaveLength(0);
    expect(repo.offers[0].status).toBe("revisao");
  });
  it("com a publicação automática LIGADA, boa oferta com desconto comprovado é publicada", async () => {
    const repo = new MemoryRepo();
    repo.settingsValue = { ...repo.settingsValue, autoPublish: true };
    await seed(repo);
    await run(repo, [pla({ priceCents: 7000, declaredPreviousCents: 10000 })], 12);
    expect(repo.offers[0]).toMatchObject({ status: "publicada", discountPct: 30, previousBasis: "loja" });
    expect(repo.offers[0].score).toBeGreaterThanOrEqual(75);
  });
  it("desconto inflado pela loja vai para revisão, mesmo com publicação automática", async () => {
    const repo = new MemoryRepo();
    repo.settingsValue = { ...repo.settingsValue, autoPublish: true };
    await seed(repo);
    await run(repo, [pla({ priceCents: 7000, declaredPreviousCents: 40000 })], 12);
    expect(repo.offers[0].status).toBe("revisao");
    expect(repo.offers[0].flags).toContain("preco_anterior_inflado");
  });
  it("oferta publicada que fica sem estoque deixa de aparecer", async () => {
    const repo = new MemoryRepo();
    repo.settingsValue = { ...repo.settingsValue, autoPublish: true };
    await seed(repo);
    await run(repo, [pla({ priceCents: 7000, declaredPreviousCents: 10000 })], 12);
    await run(repo, [pla({ priceCents: 7000, inStock: false })], 13);
    expect(repo.offers[0].status).toBe("expirada");
  });
  it("oferta recusada por uma pessoa não volta sem queda relevante de preço", async () => {
    const repo = new MemoryRepo();
    await run(repo, [pla()], 0);
    repo.offers[0].status = "rejeitada";
    repo.offers[0].reviewedAt = at(0);
    await run(repo, [pla({ priceCents: 6900 })], 2);
    expect(repo.offers.filter((o) => ["revisao", "publicada"].includes(o.status))).toHaveLength(0);
    await run(repo, [pla({ priceCents: 5000 })], 3);
    expect(repo.offers.some((o) => o.status === "revisao")).toBe(true);
  });
});

describe("expiração", () => {
  it("ofertas não reverificadas dentro do prazo expiram", async () => {
    const repo = new MemoryRepo();
    await run(repo, [pla()], 0);
    expect(await sweepExpired(repo, at(1))).toBe(0); // 24 h < 72 h: ainda vale
    expect(await sweepExpired(repo, at(4))).toBe(1); // 96 h > 72 h: expirou
    expect(repo.offers[0].status).toBe("expirada");
  });
});

describe("falhas e concorrência", () => {
  const failing = (errors: ConnectorError[], then: RawProduct[] = []): StoreConnector => {
    let i = 0;
    return { id: "feed_manual", label: "x", requiredEnv: [], rateLimit: { max: 100, perMs: 1 }, status: "pronto", async fetchProducts() { if (i < errors.length) throw errors[i++]; return then; } };
  };
  const exec = (repo: MemoryRepo, connector: StoreConnector) => runSource({ repo, connector, now: () => at(0), sleep: noSleep }, store, source, "cron");

  it("falha temporária: tenta de novo e conclui", async () => {
    const repo = new MemoryRepo();
    const r = await exec(repo, failing([new ConnectorError("503", "indisponivel", true)], [pla()]));
    expect(r.status).toBe("ok");
    expect(repo.errors.some((e) => e.kind === "retentativa")).toBe(true);
  });
  it("falha permanente (credencial): não insiste, registra o erro e marca a execução como falhou", async () => {
    const repo = new MemoryRepo();
    const r = await exec(repo, failing([new ConnectorError("credencial", "credencial", false)]));
    expect(r.status).toBe("falhou");
    expect(repo.errors.some((e) => e.kind === "credencial")).toBe(true);
    expect(repo.touched["src1"]).toBe("falhou");
  });
  it("limite de requisições esgotado depois das tentativas = falha registrada", async () => {
    const repo = new MemoryRepo();
    const r = await exec(repo, failing(Array.from({ length: 5 }, () => new ConnectorError("429", "limite", true))));
    expect(r.status).toBe("falhou");
    expect(repo.errors.filter((e) => e.kind === "retentativa").length).toBe(3);
  });
  it("uma execução por fonte: a segunda é ignorada enquanto a primeira não termina", async () => {
    const repo = new MemoryRepo();
    await repo.startRun("src1", "cron", at(0));
    const r = await exec(repo, failing([], [pla()]));
    expect(r.status).toBe("ignorada");
    expect(repo.offers).toHaveLength(0);
  });
  it("erro em um item não derruba a execução inteira (parcial)", async () => {
    const repo = new MemoryRepo();
    const orig = repo.upsertProduct.bind(repo);
    repo.upsertProduct = async (s, d, n) => { if (d.externalId === "ruim") throw new Error("falha no banco"); return orig(s, d, n); };
    const r = await run(repo, [pla({ externalId: "ok" }), pla({ externalId: "ruim" })]);
    expect(r.status).toBe("parcial");
    expect(repo.offers).toHaveLength(1);
  });
  it("conector simulado só existe com a variável de desenvolvimento", () => {
    expect(connectorFor("simulado", {})).toBeNull();
    expect(connectorFor("simulado", { OFFERS_ALLOW_SIMULATED: "sim" })).not.toBeNull();
    expect(connectorFor("desconhecido", {})).toBeNull();
  });
});

describe("feed (JSON/CSV)", () => {
  it("lê CSV com vírgula decimal, aspas e colunas em português", () => {
    const csv = 'titulo;preco;preco_de;url;marca;estoque\n"Filamento PLA 1kg; azul";R$ 69,90;99,90;https://lojaa.com.br/p1;Marca X;sim\n';
    const { products, rejected } = parseFeedText(csv);
    expect(rejected).toEqual([]);
    expect(products[0]).toMatchObject({ title: "Filamento PLA 1kg; azul", priceCents: 6990, declaredPreviousCents: 9990, brand: "Marca X", inStock: true });
  });
  it("lê JSON e rejeita linhas sem título, URL ou preço válido", () => {
    const { products, rejected } = parseFeedText(JSON.stringify([{ titulo: "A", preco: 10, url: "https://x.com" }, { titulo: "B", preco: 0, url: "https://x.com" }, { preco: 5, url: "https://x.com" }]));
    expect(products).toHaveLength(1);
    expect(rejected.map((r) => r.reason)).toEqual(["preco_invalido", "sem_titulo"]);
  });
  it("arquivo inválido gera erro claro", () => {
    expect(() => parseFeedText("{quebrado")).toThrow(ConnectorError);
    expect(parseCsv("a,b\n1,2\n")).toEqual([{ a: "1", b: "2" }]);
  });
  it("busca o feed por https e respeita erros HTTP", async () => {
    const ctx = (res: Response) => ({ config: { feedUrl: "https://parceiro.com/feed.json" }, env: {}, fetch: (async () => res) as unknown as typeof fetch, acquire: async () => {} });
    const ok = await feedConnector.fetchProducts(ctx(new Response(JSON.stringify([{ titulo: "A", preco: 10, url: "https://x.com" }]))));
    expect(ok).toHaveLength(1);
    await expect(feedConnector.fetchProducts(ctx(new Response("", { status: 429 })))).rejects.toMatchObject({ kind: "limite", retryable: true });
    await expect(feedConnector.fetchProducts({ ...ctx(new Response("")), config: { feedUrl: "http://inseguro.com/f" } })).rejects.toThrow(ConnectorError);
  });
});

describe("conectores preparados (Shopee e Mercado Livre)", () => {
  it("Shopee: assinatura no formato esperado e produtos mapeados sem inventar preço anterior", () => {
    const h = shopeeAuthHeader("123", "segredo", '{"q":1}', 1700000000);
    expect(h).toMatch(/^SHA256 Credential=123, Timestamp=1700000000, Signature=[0-9a-f]{64}$/);
    const p = nodeToProduct({ itemId: 9, productName: "PLA 1kg", priceMin: "59.90", productLink: "https://shopee.com.br/p", offerLink: "https://s.shopee.com.br/abc", imageUrl: "https://cf.shopee.com.br/i.jpg" });
    expect(p).toMatchObject({ externalId: "9", priceCents: 5990, affiliateUrl: "https://s.shopee.com.br/abc" });
    expect(p?.declaredPreviousCents).toBeUndefined();
    expect(nodeToProduct({ itemId: 1, productName: "x", priceMin: "0", productLink: "https://shopee.com.br/p" })).toBeNull();
  });
  it("Shopee: sem credenciais ou palavras-chave, falha clara; 401/429 mapeados", async () => {
    const base = { config: { keywords: ["filamento pla"] }, acquire: async () => {} };
    await expect(shopeeConnector.fetchProducts({ ...base, env: {}, fetch })).rejects.toMatchObject({ kind: "credencial" });
    const env = { SHOPEE_AFFILIATE_APP_ID: "1", SHOPEE_AFFILIATE_SECRET: "s" };
    await expect(shopeeConnector.fetchProducts({ ...base, config: {}, env, fetch })).rejects.toMatchObject({ kind: "formato" });
    await expect(shopeeConnector.fetchProducts({ ...base, env, fetch: (async () => new Response("", { status: 401 })) as unknown as typeof fetch })).rejects.toMatchObject({ kind: "credencial", retryable: false });
    await expect(shopeeConnector.fetchProducts({ ...base, env, fetch: (async () => new Response("", { status: 429 })) as unknown as typeof fetch })).rejects.toMatchObject({ kind: "limite", retryable: true });
    const limit = JSON.stringify({ errors: [{ message: "x", extensions: { code: 10030 } }] });
    await expect(shopeeConnector.fetchProducts({ ...base, env, fetch: (async () => new Response(limit)) as unknown as typeof fetch })).rejects.toMatchObject({ kind: "limite" });
  });
  it("Shopee: lê a resposta e envia a assinatura", async () => {
    let auth = "";
    const body = JSON.stringify({ data: { productOfferV2: { nodes: [{ itemId: 5, productName: "PETG 1kg", priceMin: "80", productLink: "https://shopee.com.br/p5" }] } } });
    const f = (async (_u: string, init: RequestInit) => { auth = (init.headers as Record<string, string>).authorization; return new Response(body); }) as unknown as typeof fetch;
    const r = await shopeeConnector.fetchProducts({ config: { keywords: ["petg"] }, env: { SHOPEE_AFFILIATE_APP_ID: "1", SHOPEE_AFFILIATE_SECRET: "s" }, fetch: f, acquire: async () => {} });
    expect(r).toHaveLength(1);
    expect(auth).toContain("SHA256 Credential=1");
  });
  it("Mercado Livre: usa o link do portal informado e não inventa o preço anterior", () => {
    const p = itemToProduct({ id: "MLB123456", title: "PLA", price: 70, original_price: 100, permalink: "https://produto.mercadolivre.com.br/MLB-1", thumbnail: "http://http2.mlstatic.com/a.jpg", available_quantity: 5 }, "https://mercadolivre.com.br/afil?x=1");
    expect(p).toMatchObject({ priceCents: 7000, declaredPreviousCents: 10000, inStock: true, affiliateUrl: "https://mercadolivre.com.br/afil?x=1", imageUrl: "https://http2.mlstatic.com/a.jpg" });
    expect(itemToProduct({ id: "MLB1", title: "x", price: 70, original_price: 50, permalink: "https://x.com" }, null)?.declaredPreviousCents).toBeNull();
  });
  it("Mercado Livre: exige códigos de anúncio e mapeia erros", async () => {
    await expect(mercadoLivreConnector.fetchProducts({ config: {}, env: {}, fetch, acquire: async () => {} })).rejects.toMatchObject({ kind: "formato" });
    await expect(mercadoLivreConnector.fetchProducts({ config: { itemIds: ["MLB1234567"] }, env: {}, fetch: (async () => new Response("", { status: 403 })) as unknown as typeof fetch, acquire: async () => {} })).rejects.toMatchObject({ kind: "credencial" });
    const rows = JSON.stringify([{ code: 200, body: { id: "MLB1234567", title: "Bico 0.4", price: 30, permalink: "https://produto.mercadolivre.com.br/x" } }, { code: 404, body: {} }]);
    const r = await mercadoLivreConnector.fetchProducts({ config: { itemIds: ["MLB1234567", "invalido"] }, env: {}, fetch: (async () => new Response(rows)) as unknown as typeof fetch, acquire: async () => {} });
    expect(r).toHaveLength(1);
  });
});
