import { describe, expect, it } from "vitest";
import { classifyTitle } from "./categories";
import { buildAffiliateUrl, acceptProvidedAffiliateUrl, hostAllowed, isSafeDestination, stripForeignTracking } from "./affiliate";
import { alertMatches, shouldNotify } from "./alerts";
import { areEquivalent, canonicalKey, compareEquivalents } from "./equivalence";
import { dailySeries, lowestPriceLabel, priceStats } from "./history";
import { applyCoupon, discountPct, pricePerKgCents, resolvePreviousPrice, type Coupon, type Observation } from "./pricing";
import { NonRetryableError, RateLimiter, withRetry } from "./retry";
import { decidePublication, scoreOffer, type ScoreInput } from "./score";
import { extractSpecs, extractWeightG } from "./specs";

const NOW = new Date("2026-11-10T12:00:00Z");
const day = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const obs = (list: [number, number][]): Observation[] => list.map(([d, p]) => ({ at: day(d), priceCents: p }));

describe("especificações do título", () => {
  it("extrai material, peso e diâmetro", () => {
    expect(extractSpecs("Filamento PLA Marca X 1kg 1.75mm Preto")).toMatchObject({ material: "PLA", weightG: 1000, diameterMm: 1.75 });
    expect(extractSpecs("PETG 500g 1,75 mm")).toMatchObject({ material: "PETG", weightG: 500 });
    expect(extractSpecs("Filamento ABS 2x1kg")).toMatchObject({ material: "ABS", weightG: 2000 });
  });
  it("não inventa o que não está no título", () => {
    expect(extractSpecs("Filamento 3D qualquer")).toEqual({});
    expect(extractWeightG("Bico 0.4mm")).toBeUndefined();
    expect(extractWeightG("Kit com brinde 50g")).toBeUndefined();
  });
  it("distingue variante (PLA+ ≠ PLA, silk ≠ comum)", () => {
    expect(extractSpecs("PLA+ 1kg").variant).toBe("plus");
    expect(extractSpecs("PLA Silk 1kg").variant).toBe("silk");
  });
});

describe("classificação por categoria", () => {
  it("usa palavras-chave determinísticas", () => {
    expect(classifyTitle("Filamento PETG 1kg")).toBe("filamento-petg");
    expect(classifyTitle("Bico Nozzle 0.4 Latão")).toBe("bicos-hotends");
    expect(classifyTitle("Secador de filamento Dry Box")).toBe("secadores");
    expect(classifyTitle("Impressora 3D Ender 3")).toBe("impressoras");
  });
  it("produto sem relação com 3D fica de fora", () => {
    expect(classifyTitle("Tênis esportivo masculino")).toBeNull();
  });
});

describe("desconto e preço anterior", () => {
  it("calcula percentual só quando o anterior é maior", () => {
    expect(discountPct(8000, 10000)).toBe(20);
    expect(discountPct(10000, 10000)).toBeNull();
    expect(discountPct(12000, 10000)).toBeNull();
    expect(discountPct(8000, null)).toBeNull();
  });
  it("aceita o 'preço de' da loja quando plausível", () => {
    const r = resolvePreviousPrice({ currentCents: 8000, declaredPreviousCents: 10000, history: [], now: NOW });
    expect(r).toMatchObject({ previousCents: 10000, basis: "loja" });
  });
  it("recusa 'preço de' inflado ou não maior que o atual", () => {
    expect(resolvePreviousPrice({ currentCents: 8000, declaredPreviousCents: 80000, history: [], now: NOW })).toMatchObject({ previousCents: null, basis: null, flags: ["preco_anterior_inflado"] });
    expect(resolvePreviousPrice({ currentCents: 8000, declaredPreviousCents: 7000, history: [], now: NOW }).flags).toContain("preco_anterior_nao_maior");
  });
  it("recusa 'preço de' muito acima do que nós mesmos observamos", () => {
    const h = obs([[20, 9000], [15, 9100], [10, 9000], [5, 9200], [2, 9000]]);
    const r = resolvePreviousPrice({ currentCents: 8000, declaredPreviousCents: 15000, history: h, now: NOW });
    expect(r.flags).toContain("preco_anterior_inflado");
    expect(r.basis).toBe("observado");
    expect(r.previousCents).toBe(9000);
  });
  it("sem 'preço de' e sem histórico suficiente: nenhum desconto é inventado", () => {
    expect(resolvePreviousPrice({ currentCents: 8000, history: obs([[1, 9000]]), now: NOW })).toEqual({ previousCents: null, basis: null, flags: [] });
  });
  it("com histórico suficiente, usa a mediana observada como referência", () => {
    const h = obs([[25, 10000], [20, 10000], [10, 9800], [6, 10200], [3, 10000]]);
    expect(resolvePreviousPrice({ currentCents: 8000, history: h, now: NOW })).toMatchObject({ previousCents: 10000, basis: "observado" });
  });
});

describe("cupom", () => {
  const base: Coupon = { code: "PRINT10", kind: "percent", value: 10, isActive: true, source: "loja", validUntil: new Date("2026-12-01T00:00:00Z") };
  it("aplica percentual e valor fixo", () => {
    expect(applyCoupon(10000, base, NOW)).toMatchObject({ valid: true, finalCents: 9000, savedCents: 1000 });
    expect(applyCoupon(10000, { ...base, kind: "fixed", value: 1500 }, NOW).finalCents).toBe(8500);
  });
  it("respeita teto de desconto, mínimo de compra, validade e origem", () => {
    expect(applyCoupon(10000, { ...base, maxDiscountCents: 500 }, NOW).savedCents).toBe(500);
    expect(applyCoupon(10000, { ...base, minPurchaseCents: 20000 }, NOW).reason).toBe("abaixo_do_minimo");
    expect(applyCoupon(10000, { ...base, validUntil: day(1) }, NOW).reason).toBe("expirado");
    expect(applyCoupon(10000, { ...base, validFrom: new Date("2026-12-01T00:00:00Z") }, NOW).reason).toBe("ainda_nao_vale");
    expect(applyCoupon(10000, { ...base, source: "" }, NOW).reason).toBe("sem_origem");
    expect(applyCoupon(10000, { ...base, isActive: false }, NOW).reason).toBe("inativo");
    expect(applyCoupon(10000, { ...base, code: "x" }, NOW).reason).toBe("codigo_invalido");
  });
  it("cupom que zera o preço é recusado", () => {
    expect(applyCoupon(1000, { ...base, kind: "fixed", value: 1000 }, NOW).valid).toBe(false);
    expect(applyCoupon(1000, { ...base, value: 100 }, NOW).valid).toBe(false);
  });
});

describe("equivalência e comparação", () => {
  const a = { category: "filamento-pla", brand: "Marca X", title: "Filamento PLA 1kg 1.75mm Preto", priceCents: 7000 };
  it("mesmo produto em lojas diferentes é equivalente", () => {
    expect(areEquivalent(a, { ...a, title: "PLA Marca X 1 kg 1,75 mm", priceCents: 6500 })).toBe(true);
  });
  it("1 kg não é equivalente a 500 g", () => {
    expect(areEquivalent(a, { ...a, title: "Filamento PLA 500g 1.75mm" })).toBe(false);
  });
  it("PLA ≠ PLA+ e marcas diferentes não se comparam", () => {
    expect(areEquivalent(a, { ...a, title: "Filamento PLA+ 1kg 1.75mm" })).toBe(false);
    expect(areEquivalent(a, { ...a, brand: "Outra" })).toBe(false);
  });
  it("sem marca ou sem peso, não há equivalência segura", () => {
    expect(canonicalKey({ ...a, brand: null })).toBeNull();
    expect(canonicalKey({ ...a, title: "Filamento PLA preto" })).toBeNull();
    expect(canonicalKey({ category: "impressoras", brand: "Creality", title: "Impressora 3D" })).toBeNull(); // sem modelo
  });
  it("ordena pelo preço efetivo e calcula o preço por kg", () => {
    const b = { ...a, title: "PLA Marca X 1kg 1.75mm", priceCents: 6500, couponSavedCents: 500 };
    const c = { ...a, title: "PLA Marca X 500g 1.75mm", priceCents: 3000 };
    const { rows } = compareEquivalents(a, [b, c]);
    expect(rows).toHaveLength(2); // o de 500 g ficou de fora
    expect(rows[0].effectiveCents).toBe(6000);
    expect(rows[0].perKgCents).toBe(6000);
  });
  it("frete só entra quando conhecido em todos", () => {
    const b = { ...a, title: "PLA Marca X 1kg 1.75mm", priceCents: 6500, shippingCents: 1000 };
    expect(compareEquivalents({ ...a, shippingCents: null }, [b]).shippingComparable).toBe(false);
    expect(compareEquivalents({ ...a, shippingCents: 0 }, [b]).shippingComparable).toBe(true);
  });
  it("preço por kg só com peso conhecido", () => {
    expect(pricePerKgCents(5000, 500)).toBe(10000);
    expect(pricePerKgCents(5000, null)).toBeNull();
  });
});

describe("histórico de preços", () => {
  it("calcula mínimo, média e variação, com janela declarada", () => {
    const s = priceStats(obs([[40, 9000], [30, 8800], [20, 8000], [10, 8500], [8, 8400], [2, 7500]]), { windowDays: 90, now: NOW });
    expect(s).toMatchObject({ current: 7500, min: 7500, max: 9000, observations: 6, windowDays: 90 });
    expect(s.sufficient).toBe(true);
  });
  it("dados escassos não viram afirmação de 'menor preço'", () => {
    const s = priceStats(obs([[1, 8000], [0, 7500]]), { now: NOW });
    expect(s.sufficient).toBe(false);
    expect(lowestPriceLabel(s, (c) => `R$ ${c / 100}`)).toContain("poucos dados");
    expect(lowestPriceLabel(priceStats([], { now: NOW }), String)).toBe("Ainda sem histórico.");
  });
  it("rótulo cita período e quantidade de observações", () => {
    const s = priceStats(obs([[40, 9000], [30, 8800], [20, 8000], [10, 8500], [2, 7500]]), { windowDays: 90, now: NOW });
    expect(lowestPriceLabel(s, (c) => `R$ ${c / 100}`)).toBe("Menor preço observado nas 5 observações dos últimos 90 dias: R$ 75.");
  });
  it("uma observação por dia na série", () => {
    const h = [{ at: new Date("2026-11-01T10:00:00Z"), priceCents: 9000 }, { at: new Date("2026-11-01T18:00:00Z"), priceCents: 8800 }, { at: new Date("2026-11-02T10:00:00Z"), priceCents: 9100 }];
    expect(dailySeries(h).map((o) => o.priceCents)).toEqual([8800, 9100]);
  });
});

describe("pontuação e publicação", () => {
  const good: ScoreInput = { currentCents: 6000, discountPct: 25, discountBasis: "loja", historyObservations: 10, historySpanDays: 20, historyMedianCents: 8000, relevance: 1, inStock: true, storeReliability: 90, dataQuality: 1, coupon: null, ageHours: 2 };
  it("boa oferta pontua alto, com partes explicáveis", () => {
    const r = scoreOffer(good);
    expect(r.score).toBeGreaterThanOrEqual(75);
    expect(r.parts.discount.points).toBeGreaterThan(15);
    expect(r.flags).not.toContain("historico_insuficiente");
  });
  it("sem desconto comprovado não ganha pontos de desconto", () => {
    expect(scoreOffer({ ...good, discountBasis: null, discountPct: 25 }).parts.discount.points).toBe(0);
  });
  it("sem estoque, verificação antiga ou sem preço ficam travados", () => {
    expect(scoreOffer({ ...good, inStock: false }).score).toBeLessThanOrEqual(40);
    expect(scoreOffer({ ...good, ageHours: 100 }).score).toBeLessThanOrEqual(50);
    expect(scoreOffer({ ...good, currentCents: null }).score).toBe(0);
  });
  it("desconto extremo sinaliza e vai para revisão mesmo com nota alta", () => {
    const r = scoreOffer({ ...good, discountPct: 80 });
    expect(r.flags).toContain("desconto_extremo");
    expect(decidePublication(r, { autoPublish: true, minScorePublish: 60, minScoreReview: 40 }).action).toBe("revisao");
  });
  it("publicação automática desligada nunca publica sozinha", () => {
    const r = scoreOffer(good);
    expect(decidePublication(r, { autoPublish: false, minScorePublish: 75, minScoreReview: 45 })).toMatchObject({ action: "revisao", reason: "publicacao_automatica_desligada" });
    expect(decidePublication({ score: 90, flags: [] }, { autoPublish: true, minScorePublish: 75, minScoreReview: 45 }).action).toBe("publicar");
  });
  it("nota baixa descarta e nota intermediária vai para revisão", () => {
    expect(decidePublication({ score: 20, flags: [] }, { autoPublish: true, minScorePublish: 75, minScoreReview: 45 }).action).toBe("descartar");
    expect(decidePublication({ score: 60, flags: [] }, { autoPublish: true, minScorePublish: 75, minScoreReview: 45 }).action).toBe("revisao");
  });
  it("pesos configuráveis mudam a nota", () => {
    const heavy = scoreOffer(good, { discount: 100, history: 0, relevance: 0, availability: 0, store: 0, quality: 0, coupon: 0, freshness: 0 });
    expect(heavy.score).toBe(Math.round(Math.min(1, 25 / 40) * 100));
  });
});

describe("links de afiliado e destinos", () => {
  const hosts = ["shopee.com.br", "mercadolivre.com.br"];
  it("aceita só https e hosts da loja", () => {
    expect(isSafeDestination("https://shopee.com.br/produto", hosts)).not.toBeNull();
    expect(isSafeDestination("https://www.mercadolivre.com.br/x", hosts)).not.toBeNull();
    expect(isSafeDestination("http://shopee.com.br/x", hosts)).toBeNull();
    expect(isSafeDestination("https://shopee.com.br.evil.com/x", hosts)).toBeNull();
    expect(isSafeDestination("https://evilshopee.com.br/x", hosts)).toBeNull();
    expect(isSafeDestination("https://user:pass@shopee.com.br/x", hosts)).toBeNull();
    expect(isSafeDestination("https://127.0.0.1/x", ["127.0.0.1"])).toBeNull();
    expect(isSafeDestination("javascript:alert(1)", hosts)).toBeNull();
    expect(hostAllowed("localhost", ["localhost"])).toBe(false);
  });
  it("anexa o identificador de afiliado sem sobrescrever o que já existe", () => {
    const u = buildAffiliateUrl("https://shopee.com.br/p?x=1", hosts, { params: { aff: "ABC" }, requiredParams: ["aff"] });
    expect(u).toBe("https://shopee.com.br/p?x=1&aff=ABC");
    expect(buildAffiliateUrl("https://shopee.com.br/p", hosts, { params: {}, requiredParams: ["aff"] })).toBeNull();
  });
  it("modelo de rastreador exige {url} e host permitido", () => {
    const t = "https://tracker.parceiro.com/c?id=9&u={url}";
    expect(buildAffiliateUrl("https://shopee.com.br/p", [...hosts, "parceiro.com"], { template: t, requiredParams: ["id"] })).toBe("https://tracker.parceiro.com/c?id=9&u=https%3A%2F%2Fshopee.com.br%2Fp");
    expect(buildAffiliateUrl("https://shopee.com.br/p", hosts, { template: t })).toBeNull();
    expect(buildAffiliateUrl("https://shopee.com.br/p", hosts, { template: "https://shopee.com.br/c" })).toBeNull();
  });
  it("link pronto do portal precisa ter destino permitido e os parâmetros exigidos", () => {
    expect(acceptProvidedAffiliateUrl("https://mercadolivre.com.br/p?matt_tool=1", hosts, { requiredParams: ["matt_tool"] })).toContain("matt_tool=1");
    expect(acceptProvidedAffiliateUrl("https://mercadolivre.com.br/p", hosts, { requiredParams: ["matt_tool"] })).toBeNull();
    expect(acceptProvidedAffiliateUrl("https://outro.com/p", hosts)).toBeNull();
  });
  it("limpa rastreadores de terceiros da URL do produto", () => {
    expect(stripForeignTracking("https://shopee.com.br/p?id=1&utm_source=x&gclid=y#topo")).toBe("https://shopee.com.br/p?id=1");
  });
});

describe("alertas", () => {
  const offer = { id: "o1", title: "Filamento PLA Marca X 1kg", category: "filamento-pla", storeCode: "shopee", priceCents: 5500, discountPct: 25, inStock: true };
  it("preço abaixo do alvo, por unidade e por kg", () => {
    expect(alertMatches({ kind: "preco_abaixo", maxPriceCents: 6000 }, offer)).toBe(true);
    expect(alertMatches({ kind: "preco_abaixo", maxPriceCents: 5000 }, offer)).toBe(false);
    expect(alertMatches({ kind: "preco_abaixo", maxPricePerKgCents: 6000 }, offer)).toBe(true);
    expect(alertMatches({ kind: "preco_abaixo", maxPricePerKgCents: 5000 }, offer)).toBe(false);
    expect(alertMatches({ kind: "preco_abaixo", maxPricePerKgCents: 9999 }, { ...offer, title: "Filamento PLA sem peso" })).toBe(false);
  });
  it("desconto mínimo e filtros de categoria, loja e palavras", () => {
    expect(alertMatches({ kind: "desconto_acima", minDiscountPct: 20 }, offer)).toBe(true);
    expect(alertMatches({ kind: "desconto_acima", minDiscountPct: 30 }, offer)).toBe(false);
    expect(alertMatches({ kind: "desconto_acima", minDiscountPct: 10, category: "impressoras" }, offer)).toBe(false);
    expect(alertMatches({ kind: "desconto_acima", minDiscountPct: 10, query: "marca x" }, offer)).toBe(true);
    expect(alertMatches({ kind: "desconto_acima", minDiscountPct: 10, query: "outra" }, offer)).toBe(false);
    expect(alertMatches({ kind: "desconto_acima", minDiscountPct: 10, storeCode: "ml" }, offer)).toBe(false);
  });
  it("voltou ao estoque só dispara na transição", () => {
    expect(alertMatches({ kind: "voltou_estoque" }, { ...offer, wasOutOfStock: true })).toBe(true);
    expect(alertMatches({ kind: "voltou_estoque" }, offer)).toBe(false);
  });
  it("regra sem alvo nunca dispara", () => {
    expect(alertMatches({ kind: "preco_abaixo" }, offer)).toBe(false);
  });
  it("evita aviso repetido", () => {
    const now = NOW;
    expect(shouldNotify({ lastNotifiedPriceCents: null, lastNotifiedAt: null, priceCents: 5000, now })).toBe(true);
    expect(shouldNotify({ lastNotifiedPriceCents: 5500, lastNotifiedAt: day(0.1), priceCents: 4000, now })).toBe(false); // dentro do intervalo
    expect(shouldNotify({ lastNotifiedPriceCents: 5500, lastNotifiedAt: day(3), priceCents: 5500, now })).toBe(false); // mesmo preço
    expect(shouldNotify({ lastNotifiedPriceCents: 5500, lastNotifiedAt: day(3), priceCents: 5000, now })).toBe(true); // caiu mais de 5%
  });
});

describe("retentativas e limite de requisições", () => {
  it("tenta de novo com backoff e para no limite", async () => {
    const waits: number[] = [];
    let calls = 0;
    const r = await withRetry(async () => { calls++; if (calls < 3) throw new Error("falha"); return "ok"; }, { retries: 3, baseMs: 100, sleep: async (ms) => { waits.push(ms); } });
    expect(r).toBe("ok");
    expect(waits).toEqual([100, 200]);
    await expect(withRetry(async () => { throw new Error("sempre"); }, { retries: 2, sleep: async () => {} })).rejects.toThrow("sempre");
  });
  it("erro não retentável aborta na hora", async () => {
    let calls = 0;
    await expect(withRetry(async () => { calls++; throw new NonRetryableError("credencial inválida"); }, { retries: 5, sleep: async () => {} })).rejects.toThrow("credencial inválida");
    expect(calls).toBe(1);
  });
  it("limita a taxa por janela", async () => {
    let t = 0;
    const sleeps: number[] = [];
    const rl = new RateLimiter(2, 1000, () => t, async (ms) => { sleeps.push(ms); t += ms; });
    await rl.acquire(); await rl.acquire(); await rl.acquire();
    expect(sleeps.length).toBeGreaterThan(0);
    expect(t).toBeGreaterThanOrEqual(1000);
  });
});
