import { acceptProvidedAffiliateUrl, buildAffiliateUrl, isSafeDestination, stripForeignTracking } from "./affiliate";
import { classifyTitle, isCategory } from "./categories";
import type { ConnectorContext, RawProduct, StoreConnector } from "./connectors/types";
import { ConnectorError } from "./connectors/types";
import { canonicalKey } from "./equivalence";
import { applyCoupon, discountPct, isPlausiblePrice, resolvePreviousPrice } from "./pricing";
import type { OfferInput, OfferRow, OffersRepo, Source, Store } from "./repo";
import { RateLimiter, withRetry } from "./retry";
import { decidePublication, scoreOffer } from "./score";
import { extractSpecs } from "./specs";

export type RunStats = { vistos: number; ignorados: number; novos_produtos: number; ofertas_criadas: number; ofertas_atualizadas: number; publicadas: number; em_revisao: number; descartadas: number; expiradas: number; erros: number };
const zero = (): RunStats => ({ vistos: 0, ignorados: 0, novos_produtos: 0, ofertas_criadas: 0, ofertas_atualizadas: 0, publicadas: 0, em_revisao: 0, descartadas: 0, expiradas: 0, erros: 0 });

export type CollectorDeps = {
  repo: OffersRepo;
  fetch?: typeof fetch;
  env?: Record<string, string | undefined>;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  connector?: StoreConnector;
};

const HOUR = 3_600_000;

/** Processa UM produto bruto: valida, registra histórico, pontua e decide. Nunca inventa campos. */
export async function processProduct(deps: Required<Pick<CollectorDeps, "repo">> & { now: Date }, store: Store, raw: RawProduct, stats: RunStats, settings: Awaited<ReturnType<OffersRepo["settings"]>>, source: string): Promise<void> {
  const { repo, now } = deps;
  if (!raw.title?.trim() || !isPlausiblePrice(raw.priceCents)) { stats.ignorados++; return; }
  const productUrl = isSafeDestination(raw.productUrl, store.allowedHosts);
  if (!productUrl) { stats.ignorados++; await repo.recordError(null, null, "destino_nao_permitido", `Destino fora da lista da loja ${store.code}`, { loja: store.code }); return; }
  const category = raw.categoryHint && isCategory(raw.categoryHint) ? raw.categoryHint : classifyTitle(raw.title);
  if (!category) { stats.ignorados++; return; }

  const specs = extractSpecs(raw.title);
  const flags: string[] = [];
  const imageUrl = raw.imageUrl && /^https:\/\//.test(raw.imageUrl) ? raw.imageUrl : null;
  if (!imageUrl) flags.push("imagem_ausente");

  const { product, isNew } = await repo.upsertProduct(store.id, {
    externalId: raw.externalId.slice(0, 120), title: raw.title.trim().slice(0, 300), brand: raw.brand?.trim() || null, model: raw.model?.trim() || null, category, imageUrl,
    productUrl: stripForeignTracking(productUrl.toString()), attrs: specs as Record<string, unknown>, canonicalKey: canonicalKey({ category, brand: raw.brand, model: raw.model, title: raw.title, specs }), isSimulated: store.isSimulated,
  }, now);
  if (isNew) stats.novos_produtos++;

  // histórico: só grava observação nova se o preço mudou ou se a última tem mais de 6 h (evita inflar o histórico)
  const last = await repo.lastObservation(product.id);
  if (!last || last.priceCents !== raw.priceCents || last.inStock !== (raw.inStock ?? null) || now.getTime() - last.at.getTime() > 6 * HOUR) {
    await repo.addObservation(product.id, { priceCents: raw.priceCents, inStock: raw.inStock ?? null, source, at: now });
  }
  const history = await repo.history(product.id, settings.historyWindowDays, now);
  const before = history.filter((h) => h.at < now);
  if (history.length <= 1) flags.push("primeiro_registro");

  // preço anterior comprovado
  const prev = resolvePreviousPrice({ currentCents: raw.priceCents, declaredPreviousCents: raw.declaredPreviousCents, history: before.length ? before : [], now });
  flags.push(...prev.flags);
  const pct = discountPct(raw.priceCents, prev.previousCents);

  // cupom: só o cadastrado (com origem) e válido; nunca inferido do texto da loja
  let couponId: string | null = null;
  let couponSaved = 0;
  let couponInfo: { valid: boolean; daysLeft: number | null } | null = null;
  const coupons = await repo.coupons(store.id);
  const wanted = raw.couponCode ? coupons.filter((c) => c.code === raw.couponCode) : coupons;
  let best: { id: string; saved: number; until: Date | null } | null = null;
  for (const c of wanted) {
    const r = applyCoupon(raw.priceCents, c, now);
    if (r.valid && (!best || r.savedCents > best.saved)) best = { id: c.id, saved: r.savedCents, until: c.validUntil ?? null };
  }
  if (best) { couponId = best.id; couponSaved = best.saved; couponInfo = { valid: true, daysLeft: best.until ? Math.max(0, (best.until.getTime() - now.getTime()) / 86_400_000) : null }; }

  // link: afiliado pronto > montado pelo modelo da loja > link comum (e nesse caso vai para revisão)
  const provided = raw.affiliateUrl ? acceptProvidedAffiliateUrl(raw.affiliateUrl, store.allowedHosts, store.affiliateConfig) : null;
  const built = provided ?? buildAffiliateUrl(productUrl.toString(), store.allowedHosts, store.affiliateConfig);
  const hasAffiliateRule = Boolean(store.affiliateConfig.template || Object.keys(store.affiliateConfig.params ?? {}).length);
  const linkUrl = built && (provided || hasAffiliateRule) ? built : productUrl.toString();
  const isAffiliate = Boolean(built && (provided || hasAffiliateRule));
  if (!isAffiliate) flags.push("sem_link_afiliado");

  const filament = category.startsWith("filamento-");
  const quality = [imageUrl, raw.brand?.trim(), filament ? specs.weightG : raw.model?.trim() ?? true, pct !== null || before.length >= 3 ? true : null].filter(Boolean).length / 4;
  const medianObs = before.length ? [...before].sort((a, b) => a.priceCents - b.priceCents)[Math.floor(before.length / 2)].priceCents : null;
  const spanDays = before.length ? (Math.max(...before.map((h) => h.at.getTime())) - Math.min(...before.map((h) => h.at.getTime()))) / 86_400_000 : 0;

  const result = scoreOffer({
    currentCents: raw.priceCents, discountPct: pct, discountBasis: prev.basis, historyObservations: before.length, historySpanDays: spanDays, historyMedianCents: medianObs,
    relevance: category === "acessorios" ? 0.6 : 1, inStock: raw.inStock ?? null, storeReliability: store.reliability, dataQuality: quality, coupon: couponInfo, ageHours: 0, flags,
  }, settings.weights);
  const decision = decidePublication(result, settings);

  const existing = await repo.openOffer(product.id);
  const base: Omit<OfferInput, "status" | "id"> = {
    productId: product.id, priceCents: raw.priceCents, previousPriceCents: prev.previousCents, previousBasis: prev.basis, discountPct: pct, couponId, couponSavedCents: couponSaved,
    shippingCents: raw.shippingCents ?? null, inStock: raw.inStock ?? null, score: result.score, scoreDetail: { parts: result.parts }, flags: result.flags, linkUrl, isAffiliate,
    featured: existing?.featured ?? false, validUntil: null, lastCheckedAt: now, reviewReason: decision.reason, reviewedAt: existing?.reviewedAt ?? null, isSimulated: store.isSimulated,
  };

  if (!existing) {
    const latest = await repo.latestOffer(product.id);
    // oferta recusada por uma pessoa não volta a aparecer sem uma queda relevante de preço
    if (latest?.status === "rejeitada" && now.getTime() - (latest.reviewedAt ?? latest.lastCheckedAt).getTime() < 14 * 24 * HOUR && raw.priceCents > latest.priceCents * 0.9) { stats.descartadas++; return; }
    if (decision.action === "descartar") { stats.descartadas++; return; }
    const status = decision.action === "publicar" ? "publicada" : "revisao";
    await repo.saveOffer({ ...base, status });
    stats.ofertas_criadas++;
    if (status === "publicada") stats.publicadas++; else stats.em_revisao++;
    return;
  }

  // oferta já aberta: atualiza. Publicada continua publicada, a menos que deixe de valer.
  let status: OfferRow["status"] = existing.status;
  if (existing.status === "publicada") {
    if (decision.action === "descartar" || raw.inStock === false) status = "expirada";
    else if (result.flags.some((f) => ["preco_anterior_inflado", "desconto_extremo", "dados_inconsistentes"].includes(f))) status = "revisao";
  } else if (existing.status === "revisao" || existing.status === "rascunho") {
    if (decision.action === "descartar") status = "expirada";
    else if (decision.action === "publicar" && existing.reviewedAt === null) status = "publicada";
  }
  await repo.saveOffer({ ...base, id: existing.id, status });
  stats.ofertas_atualizadas++;
  if (status === "expirada") stats.expiradas++;
  else if (status === "publicada" && existing.status !== "publicada") stats.publicadas++;
  else if (status === "revisao") stats.em_revisao++;
}

export type SourceRun = { runId: string | null; status: "ok" | "parcial" | "falhou" | "ignorada"; stats: RunStats; error?: string };

/** Executa uma fonte: conector (ou lista importada) → processamento → registro da execução. Concorrência: uma execução por fonte. */
export async function runSource(deps: CollectorDeps, store: Store, source: Source, trigger: "cron" | "manual" | "importacao", imported?: RawProduct[]): Promise<SourceRun> {
  const repo = deps.repo;
  const now = (deps.now ?? (() => new Date()))();
  const stats = zero();
  const runId = await repo.startRun(source.id, trigger, now);
  if (!runId) return { runId: null, status: "ignorada", stats, error: "Já existe uma execução em andamento para esta fonte." };
  try {
    const settings = await repo.settings();
    let items: RawProduct[];
    if (imported) items = imported;
    else {
      const connector = deps.connector;
      if (!connector) throw new ConnectorError("Conector não disponível neste ambiente.", "indisponivel");
      const limiter = new RateLimiter(connector.rateLimit.max, connector.rateLimit.perMs, undefined, deps.sleep);
      const ctx: ConnectorContext = { config: source.config, env: deps.env ?? {}, fetch: deps.fetch ?? fetch, acquire: () => limiter.acquire() };
      items = await withRetry(() => connector.fetchProducts(ctx), {
        retries: 3, baseMs: 800, sleep: deps.sleep,
        isRetryable: (e) => !(e instanceof ConnectorError) || e.retryable,
        onRetry: (attempt, delay) => void repo.recordError(runId, source.id, "retentativa", `Nova tentativa ${attempt} em ${Math.round(delay / 1000)}s`, { tentativa: attempt }),
      });
    }
    stats.vistos = items.length;
    for (const raw of items) {
      try {
        await processProduct({ repo, now }, store, raw, stats, settings, source.connector);
      } catch (e) {
        stats.erros++;
        await repo.recordError(runId, source.id, "item", String((e as Error).message).slice(0, 250), { externo: raw.externalId.slice(0, 40) });
      }
    }
    const status = stats.erros === 0 ? "ok" : stats.erros < items.length ? "parcial" : "falhou";
    await repo.finishRun(runId, status, stats, null, now);
    await repo.touchSource(source.id, status, now);
    return { runId, status, stats };
  } catch (e) {
    const err = (e as Error).message;
    const kind = e instanceof ConnectorError ? e.kind : "coleta";
    stats.erros++;
    await repo.recordError(runId, source.id, kind, String(err).slice(0, 280));
    await repo.finishRun(runId, "falhou", stats, String(err).slice(0, 280), now);
    await repo.touchSource(source.id, "falhou", now);
    return { runId, status: "falhou", stats, error: String(err).slice(0, 280) };
  }
}

/** Ofertas que não são reverificadas dentro do prazo (ou passaram da validade) deixam de aparecer. */
export async function sweepExpired(repo: OffersRepo, now: Date = new Date()): Promise<number> {
  const s = await repo.settings();
  return repo.expireStale(now, s.expireAfterHours);
}
