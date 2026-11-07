import type { Observation } from "./pricing";
import { DEFAULT_PUBLISH, DEFAULT_WEIGHTS } from "./score";
import type { AlertOffer } from "./alerts";
import type { AlertRecord, CouponRecord, NotificationRecord, OfferInput, OfferRow, OfferSettings, OffersRepo, ProductData, ProductRow, Source, Store } from "./repo";

/** Implementação em memória do repositório: usada nos testes (e documenta o comportamento esperado do banco). */
export class MemoryRepo implements OffersRepo {
  settingsValue: OfferSettings = { ...DEFAULT_PUBLISH, weights: DEFAULT_WEIGHTS, allowSimulated: false, historyWindowDays: 90, expireAfterHours: 72 };
  couponList: (CouponRecord & { storeId: string })[] = [];
  products: ProductRow[] = [];
  observations = new Map<string, { priceCents: number; inStock: boolean | null; source: string; at: Date }[]>();
  offers: OfferRow[] = [];
  runs: { id: string; sourceId: string; status: string; stats?: Record<string, number>; error?: string | null }[] = [];
  errors: { runId: string | null; sourceId: string | null; kind: string; message: string }[] = [];
  alerts: AlertRecord[] = [];
  notifications: (NotificationRecord & { channel: string; status: string })[] = [];
  touched: Record<string, string> = {};
  private n = 0;
  private id = (p: string) => `${p}-${++this.n}`;

  async settings() { return this.settingsValue; }
  async coupons(storeId: string) { return this.couponList.filter((c) => c.storeId === storeId); }
  async upsertProduct(storeId: string, data: ProductData, ...rest: [Date?]) {
    void rest;
    const found = this.products.find((p) => p.storeId === storeId && p.externalId === data.externalId);
    if (found) { Object.assign(found, data); return { product: found, isNew: false }; }
    const row: ProductRow = { ...data, id: this.id("prod"), storeId };
    this.products.push(row);
    return { product: row, isNew: true };
  }
  async lastObservation(productId: string) {
    const list = this.observations.get(productId) ?? [];
    const o = list[list.length - 1];
    return o ? { priceCents: o.priceCents, inStock: o.inStock, at: o.at } : null;
  }
  async addObservation(productId: string, o: { priceCents: number; inStock: boolean | null; source: string; at: Date }) {
    this.observations.set(productId, [...(this.observations.get(productId) ?? []), o]);
  }
  async history(productId: string, windowDays: number, now: Date): Promise<Observation[]> {
    const from = now.getTime() - windowDays * 86_400_000;
    return (this.observations.get(productId) ?? []).filter((o) => o.at.getTime() >= from).map((o) => ({ priceCents: o.priceCents, at: o.at }));
  }
  async openOffer(productId: string) { return this.offers.find((o) => o.productId === productId && ["rascunho", "revisao", "publicada"].includes(o.status)) ?? null; }
  async latestOffer(productId: string) { return [...this.offers].reverse().find((o) => o.productId === productId) ?? null; }
  async saveOffer(o: OfferInput): Promise<OfferRow> {
    if (o.id) {
      const i = this.offers.findIndex((x) => x.id === o.id);
      this.offers[i] = { ...this.offers[i], ...o, id: o.id };
      return this.offers[i];
    }
    if (await this.openOffer(o.productId)) throw new Error("oferta duplicada em aberto");
    const row: OfferRow = { ...o, id: this.id("offer"), createdAt: new Date() };
    this.offers.push(row);
    return row;
  }
  async expireStale(now: Date, afterHours: number) {
    let n = 0;
    for (const o of this.offers) {
      if (!["publicada", "revisao", "rascunho"].includes(o.status)) continue;
      const stale = now.getTime() - o.lastCheckedAt.getTime() > afterHours * 3_600_000;
      const over = o.validUntil !== null && o.validUntil.getTime() < now.getTime();
      if (stale || over) { o.status = "expirada"; n++; }
    }
    return n;
  }
  async startRun(sourceId: string, ...rest: [string?, Date?]) {
    void rest;
    if (this.runs.some((r) => r.sourceId === sourceId && r.status === "executando")) return null;
    const id = this.id("run");
    this.runs.push({ id, sourceId, status: "executando" });
    return id;
  }
  async finishRun(runId: string, status: "ok" | "parcial" | "falhou", stats: Record<string, number>, error: string | null) {
    const r = this.runs.find((x) => x.id === runId)!;
    Object.assign(r, { status, stats, error });
  }
  async recordError(runId: string | null, sourceId: string | null, kind: string, message: string) { this.errors.push({ runId, sourceId, kind, message }); }
  async touchSource(sourceId: string, status: string) { this.touched[sourceId] = status; }
  storeList: Store[] = [];
  sourceList: Source[] = [];
  async dueSources(now: Date) {
    return this.sourceList.filter((s) => s.isActive && (!s.lastRunAt || now.getTime() - s.lastRunAt.getTime() >= s.frequencyMinutes * 60_000))
      .flatMap((source) => { const store = this.storeList.find((x) => x.id === source.storeId && x.isActive); return store ? [{ store, source }] : []; });
  }
  async recentPublishedOffers(since: Date): Promise<(AlertOffer & { offerLinkReady: boolean })[]> {
    return this.offers.filter((o) => o.status === "publicada" && o.lastCheckedAt >= since).map((o) => {
      const p = this.products.find((x) => x.id === o.productId)!;
      const obs = this.observations.get(o.productId) ?? [];
      const prevStock = obs.length >= 2 ? obs[obs.length - 2].inStock : null;
      return { id: o.id, title: p.title, category: p.category, storeCode: this.storeList.find((s) => s.id === p.storeId)?.code ?? "", storeName: this.storeList.find((s) => s.id === p.storeId)?.name, priceCents: o.priceCents, discountPct: o.discountPct, inStock: o.inStock, wasOutOfStock: prevStock === false, weightG: (p.attrs as { weightG?: number }).weightG ?? null, offerLinkReady: true };
    });
  }
  async activeAlerts() { return this.alerts; }
  async lastNotification(alertId: string, offerId: string) {
    return [...this.notifications].reverse().find((n) => n.alertId === alertId && n.offerId === offerId && n.status !== "falhou") ?? null;
  }
  async recordNotification(n: { alertId: string; offerId: string; priceCents: number; channel: string; status: "enviada" | "sem_provedor" | "falhou"; at: Date }) {
    this.notifications.push({ alertId: n.alertId, offerId: n.offerId, priceCents: n.priceCents, sentAt: n.at, channel: n.channel, status: n.status });
  }
}
