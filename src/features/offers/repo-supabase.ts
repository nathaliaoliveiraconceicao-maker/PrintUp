import type { SupabaseClient } from "@supabase/supabase-js";
import type { AlertOffer, AlertRule } from "./alerts";
import type { Observation } from "./pricing";
import { DEFAULT_PUBLISH, DEFAULT_WEIGHTS, type ScoreWeights } from "./score";
import type { AlertRecord, CouponRecord, NotificationRecord, OfferInput, OfferRow, OfferSettings, OffersRepo, ProductData, ProductRow, Source, Store } from "./repo";

type Row = Record<string, unknown>;
const d = (v: unknown): Date | null => (typeof v === "string" ? new Date(v) : null);

export const rowToStore = (r: Row): Store => ({ id: r.id as string, code: r.code as string, name: r.name as string, kind: r.kind as string, allowedHosts: (r.allowed_hosts as string[]) ?? [], reliability: Number(r.reliability ?? 60), affiliateConfig: (r.affiliate_config as Store["affiliateConfig"]) ?? {}, isSimulated: Boolean(r.is_simulated), isActive: Boolean(r.is_active), disclosure: r.disclosure as string | undefined });
export const rowToSource = (r: Row): Source => ({ id: r.id as string, storeId: r.store_id as string, connector: r.connector as string, name: r.name as string, config: (r.config as Record<string, unknown>) ?? {}, frequencyMinutes: Number(r.frequency_minutes ?? 1440), isActive: Boolean(r.is_active), lastRunAt: d(r.last_run_at) });
const rowToProduct = (r: Row): ProductRow => ({ id: r.id as string, storeId: r.store_id as string, externalId: r.external_id as string, title: r.title as string, brand: (r.brand as string) ?? null, model: (r.model as string) ?? null, category: r.category as string, imageUrl: (r.image_url as string) ?? null, productUrl: r.product_url as string, attrs: (r.attrs as Record<string, unknown>) ?? {}, canonicalKey: (r.canonical_key as string) ?? null, isSimulated: Boolean(r.is_simulated) });
export const rowToOffer = (r: Row): OfferRow => ({
  id: r.id as string, productId: r.product_id as string, status: r.status as OfferRow["status"], priceCents: Number(r.price_cents), previousPriceCents: r.previous_price_cents === null ? null : Number(r.previous_price_cents),
  previousBasis: (r.previous_basis as OfferRow["previousBasis"]) ?? null, discountPct: r.discount_pct === null ? null : Number(r.discount_pct), couponId: (r.coupon_id as string) ?? null, couponSavedCents: Number(r.coupon_saved_cents ?? 0),
  shippingCents: r.shipping_cents === null ? null : Number(r.shipping_cents), inStock: (r.in_stock as boolean | null) ?? null, score: Number(r.score ?? 0), scoreDetail: (r.score_detail as Record<string, unknown>) ?? {}, flags: (r.flags as string[]) ?? [],
  linkUrl: r.link_url as string, isAffiliate: Boolean(r.is_affiliate), featured: Boolean(r.featured), validUntil: d(r.valid_until), lastCheckedAt: d(r.last_checked_at) ?? new Date(), reviewReason: (r.review_reason as string) ?? null, reviewedAt: d(r.reviewed_at), isSimulated: Boolean(r.is_simulated),
});
const offerToRow = (o: OfferInput): Row => ({
  product_id: o.productId, status: o.status, price_cents: o.priceCents, previous_price_cents: o.previousPriceCents, previous_basis: o.previousBasis, discount_pct: o.discountPct, coupon_id: o.couponId, coupon_saved_cents: o.couponSavedCents,
  shipping_cents: o.shippingCents, in_stock: o.inStock, score: o.score, score_detail: o.scoreDetail, flags: o.flags, link_url: o.linkUrl, is_affiliate: o.isAffiliate, featured: o.featured, valid_until: o.validUntil?.toISOString() ?? null,
  last_checked_at: o.lastCheckedAt.toISOString(), review_reason: o.reviewReason, reviewed_at: o.reviewedAt?.toISOString() ?? null, is_simulated: o.isSimulated,
});

/** Persistência no Supabase com a chave de SERVIÇO (só servidor: cron, importação e ações do superadmin já autenticado). */
export class SupabaseRepo implements OffersRepo {
  constructor(private readonly db: SupabaseClient) {}

  async settings(): Promise<OfferSettings> {
    const { data } = await this.db.from("offer_settings").select("key, value");
    const m = new Map((data ?? []).map((r: Row) => [r.key as string, r.value]));
    const num = (k: string, def: number) => (typeof m.get(k) === "number" ? (m.get(k) as number) : def);
    const w = (m.get("weights") as Partial<ScoreWeights> | undefined) ?? {};
    return {
      autoPublish: m.get("auto_publish") === true, minScorePublish: num("min_score_publish", DEFAULT_PUBLISH.minScorePublish), minScoreReview: num("min_score_review", DEFAULT_PUBLISH.minScoreReview),
      weights: { ...DEFAULT_WEIGHTS, ...w }, allowSimulated: m.get("allow_simulated") === true, historyWindowDays: num("history_window_days", 90), expireAfterHours: num("expire_after_hours", 72),
    };
  }
  async coupons(storeId: string): Promise<CouponRecord[]> {
    const { data } = await this.db.from("offer_coupons").select("*").eq("store_id", storeId).eq("is_active", true);
    return (data ?? []).map((r: Row) => ({ id: r.id as string, code: r.code as string, kind: r.kind as "percent" | "fixed", value: Number(r.value), minPurchaseCents: (r.min_purchase_cents as number) ?? null, maxDiscountCents: (r.max_discount_cents as number) ?? null, validFrom: d(r.valid_from), validUntil: d(r.valid_until), isActive: Boolean(r.is_active), source: r.source as string }));
  }
  async upsertProduct(storeId: string, p: ProductData, now: Date) {
    const { data: found } = await this.db.from("offer_products").select("*").eq("store_id", storeId).eq("external_id", p.externalId).maybeSingle();
    const row = { store_id: storeId, external_id: p.externalId, title: p.title, brand: p.brand, model: p.model, category: p.category, image_url: p.imageUrl, product_url: p.productUrl, attrs: p.attrs, canonical_key: p.canonicalKey, is_simulated: p.isSimulated, last_seen_at: now.toISOString() };
    if (found) {
      const { data, error } = await this.db.from("offer_products").update(row).eq("id", found.id).select("*").single();
      if (error) throw new Error(error.message);
      return { product: rowToProduct(data as Row), isNew: false };
    }
    const { data, error } = await this.db.from("offer_products").insert(row).select("*").single();
    if (error) throw new Error(error.message);
    return { product: rowToProduct(data as Row), isNew: true };
  }
  async lastObservation(productId: string) {
    const { data } = await this.db.from("offer_price_history").select("price_cents, in_stock, observed_at").eq("product_id", productId).order("observed_at", { ascending: false }).limit(1).maybeSingle();
    return data ? { priceCents: Number(data.price_cents), inStock: (data.in_stock as boolean | null) ?? null, at: new Date(data.observed_at as string) } : null;
  }
  async addObservation(productId: string, o: { priceCents: number; inStock: boolean | null; source: string; at: Date }) {
    const { error } = await this.db.from("offer_price_history").insert({ product_id: productId, price_cents: o.priceCents, in_stock: o.inStock, source: o.source.slice(0, 40), observed_at: o.at.toISOString() });
    if (error) throw new Error(error.message);
  }
  async history(productId: string, windowDays: number, now: Date): Promise<Observation[]> {
    const from = new Date(now.getTime() - windowDays * 86_400_000).toISOString();
    const { data } = await this.db.from("offer_price_history").select("price_cents, observed_at").eq("product_id", productId).gte("observed_at", from).order("observed_at").limit(2000);
    return (data ?? []).map((r: Row) => ({ priceCents: Number(r.price_cents), at: new Date(r.observed_at as string) }));
  }
  async openOffer(productId: string) {
    const { data } = await this.db.from("offers").select("*").eq("product_id", productId).in("status", ["rascunho", "revisao", "publicada"]).maybeSingle();
    return data ? rowToOffer(data as Row) : null;
  }
  async latestOffer(productId: string) {
    const { data } = await this.db.from("offers").select("*").eq("product_id", productId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    return data ? rowToOffer(data as Row) : null;
  }
  async saveOffer(o: OfferInput): Promise<OfferRow> {
    const row = offerToRow(o);
    const q = o.id ? this.db.from("offers").update(row).eq("id", o.id) : this.db.from("offers").insert(row);
    const { data, error } = await q.select("*").single();
    if (error) throw new Error(error.message);
    return rowToOffer(data as Row);
  }
  async expireStale(now: Date, afterHours: number) {
    const cutoff = new Date(now.getTime() - afterHours * 3_600_000).toISOString();
    const a = await this.db.from("offers").update({ status: "expirada" }).in("status", ["publicada", "revisao", "rascunho"]).lt("last_checked_at", cutoff).select("id");
    const b = await this.db.from("offers").update({ status: "expirada" }).in("status", ["publicada", "revisao", "rascunho"]).lt("valid_until", now.toISOString()).select("id");
    return (a.data?.length ?? 0) + (b.data?.length ?? 0);
  }
  async startRun(sourceId: string, trigger: "cron" | "manual" | "importacao", now: Date) {
    // execuções "presas" (travadas há mais de 30 min) são encerradas para liberar a fonte
    await this.db.from("offer_runs").update({ status: "falhou", finished_at: now.toISOString(), error: "Execução interrompida (tempo esgotado)." }).eq("source_id", sourceId).eq("status", "executando").lt("started_at", new Date(now.getTime() - 30 * 60_000).toISOString());
    const { data, error } = await this.db.from("offer_runs").insert({ source_id: sourceId, trigger, started_at: now.toISOString() }).select("id").single();
    if (error) { if (error.code === "23505") return null; throw new Error(error.message); }
    return data.id as string;
  }
  async finishRun(runId: string, status: "ok" | "parcial" | "falhou", stats: Record<string, number>, error: string | null, now: Date) {
    await this.db.from("offer_runs").update({ status, stats, error, finished_at: now.toISOString() }).eq("id", runId);
  }
  async recordError(runId: string | null, sourceId: string | null, kind: string, message: string, meta: Record<string, unknown> = {}) {
    await this.db.from("offer_errors").insert({ run_id: runId, source_id: sourceId, kind: kind.replace(/[^a-z_]/g, "_").slice(0, 40), message: message.slice(0, 300), meta });
  }
  async touchSource(sourceId: string, status: string, at: Date) {
    await this.db.from("offer_sources").update({ last_run_at: at.toISOString(), last_status: status }).eq("id", sourceId);
  }
  async dueSources(now: Date) {
    const [{ data: src }, { data: sts }] = await Promise.all([this.db.from("offer_sources").select("*").eq("is_active", true), this.db.from("offer_stores").select("*").eq("is_active", true)]);
    const stores = new Map(((sts ?? []) as Row[]).map((r) => [r.id as string, rowToStore(r)]));
    return ((src ?? []) as Row[]).flatMap((r) => {
      const source = rowToSource(r), store = stores.get(source.storeId);
      const due = !source.lastRunAt || now.getTime() - source.lastRunAt.getTime() >= source.frequencyMinutes * 60_000;
      return store && due ? [{ store, source }] : [];
    });
  }
  async recentPublishedOffers(since: Date): Promise<(AlertOffer & { offerLinkReady: boolean })[]> {
    const { data } = await this.db.from("offers").select("id, price_cents, discount_pct, in_stock, product_id").eq("status", "publicada").gte("last_checked_at", since.toISOString()).limit(1000);
    const offers = (data ?? []) as Row[];
    if (offers.length === 0) return [];
    const [{ data: prods }, { data: sts }] = await Promise.all([this.db.from("offer_products").select("id, store_id, title, category, attrs").in("id", [...new Set(offers.map((o) => o.product_id as string))]), this.db.from("offer_stores").select("id, code, name")]);
    const P = new Map(((prods ?? []) as Row[]).map((p) => [p.id as string, p])), S = new Map(((sts ?? []) as Row[]).map((s) => [s.id as string, s]));
    const out: (AlertOffer & { offerLinkReady: boolean })[] = [];
    for (const r of offers) {
      const p = P.get(r.product_id as string);
      if (!p) continue;
      const store = S.get(p.store_id as string);
      const { data: obs } = await this.db.from("offer_price_history").select("in_stock").eq("product_id", r.product_id as string).order("observed_at", { ascending: false }).limit(2);
      const prev = obs && obs.length >= 2 ? (obs[1].in_stock as boolean | null) : null;
      out.push({ id: r.id as string, title: p.title as string, category: p.category as string, storeCode: (store?.code as string) ?? "", storeName: store?.name as string | undefined, priceCents: Number(r.price_cents), discountPct: r.discount_pct === null ? null : Number(r.discount_pct), inStock: (r.in_stock as boolean | null) ?? null, wasOutOfStock: prev === false, weightG: ((p.attrs as { weightG?: number }) ?? {}).weightG ?? null, offerLinkReady: true });
    }
    return out;
  }
  async activeAlerts(): Promise<AlertRecord[]> {
    const { data } = await this.db.from("offer_alerts").select("id, user_id, rule, channel, cooldown_hours").eq("is_active", true).limit(5000);
    return (data ?? []).map((r: Row) => ({ id: r.id as string, userId: r.user_id as string, rule: r.rule as AlertRule, channel: r.channel as AlertRecord["channel"], cooldownHours: Number(r.cooldown_hours) }));
  }
  async lastNotification(alertId: string, offerId: string): Promise<NotificationRecord | null> {
    const { data } = await this.db.from("offer_alert_notifications").select("alert_id, offer_id, price_cents, sent_at").eq("alert_id", alertId).eq("offer_id", offerId).neq("status", "falhou").order("sent_at", { ascending: false }).limit(1).maybeSingle();
    return data ? { alertId, offerId, priceCents: Number(data.price_cents), sentAt: new Date(data.sent_at as string) } : null;
  }
  async recordNotification(n: { alertId: string; offerId: string; priceCents: number; channel: string; status: "enviada" | "sem_provedor" | "falhou"; at: Date }) {
    await this.db.from("offer_alert_notifications").insert({ alert_id: n.alertId, offer_id: n.offerId, price_cents: n.priceCents, channel: n.channel, status: n.status, sent_at: n.at.toISOString() });
  }
}
