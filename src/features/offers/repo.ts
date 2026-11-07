import type { AffiliateConfig } from "./affiliate";
import type { AlertOffer, AlertRule } from "./alerts";
import type { Coupon, Observation } from "./pricing";
import type { PublishSettings, ScoreWeights } from "./score";

export type Store = { id: string; code: string; name: string; kind: string; allowedHosts: string[]; reliability: number; affiliateConfig: AffiliateConfig; isSimulated: boolean; isActive: boolean; disclosure?: string };
export type Source = { id: string; storeId: string; connector: string; name: string; config: Record<string, unknown>; frequencyMinutes: number; isActive: boolean; lastRunAt: Date | null };
export type OfferSettings = PublishSettings & { weights: ScoreWeights; allowSimulated: boolean; historyWindowDays: number; expireAfterHours: number };

export type ProductData = { externalId: string; title: string; brand: string | null; model: string | null; category: string; imageUrl: string | null; productUrl: string; attrs: Record<string, unknown>; canonicalKey: string | null; isSimulated: boolean };
export type ProductRow = ProductData & { id: string; storeId: string };

export type OfferStatus = "rascunho" | "revisao" | "publicada" | "expirada" | "rejeitada";
export type OfferRow = {
  id: string; productId: string; status: OfferStatus; priceCents: number; previousPriceCents: number | null; previousBasis: "loja" | "observado" | null; discountPct: number | null;
  couponId: string | null; couponSavedCents: number; shippingCents: number | null; inStock: boolean | null; score: number; scoreDetail: Record<string, unknown>; flags: string[];
  linkUrl: string; isAffiliate: boolean; featured: boolean; validUntil: Date | null; lastCheckedAt: Date; reviewReason: string | null; reviewedAt: Date | null; isSimulated: boolean; createdAt?: Date;
};
export type OfferInput = Omit<OfferRow, "id"> & { id?: string };
export type CouponRecord = Coupon & { id: string };

export type AlertRecord = { id: string; userId: string; rule: AlertRule; channel: "email" | "whatsapp" | "push"; cooldownHours: number };
export type NotificationRecord = { offerId: string; alertId: string; priceCents: number; sentAt: Date };

/** Persistência do módulo. Há uma implementação em memória (testes) e uma no Supabase (servidor, chave de serviço). */
export interface OffersRepo {
  settings(): Promise<OfferSettings>;
  coupons(storeId: string): Promise<CouponRecord[]>;
  upsertProduct(storeId: string, data: ProductData, now: Date): Promise<{ product: ProductRow; isNew: boolean }>;
  lastObservation(productId: string): Promise<{ priceCents: number; inStock: boolean | null; at: Date } | null>;
  addObservation(productId: string, o: { priceCents: number; inStock: boolean | null; source: string; at: Date }): Promise<void>;
  history(productId: string, windowDays: number, now: Date): Promise<Observation[]>;
  openOffer(productId: string): Promise<OfferRow | null>;
  latestOffer(productId: string): Promise<OfferRow | null>;
  saveOffer(o: OfferInput): Promise<OfferRow>;
  expireStale(now: Date, afterHours: number): Promise<number>;
  startRun(sourceId: string, trigger: "cron" | "manual" | "importacao", now: Date): Promise<string | null>;
  finishRun(runId: string, status: "ok" | "parcial" | "falhou", stats: Record<string, number>, error: string | null, now: Date): Promise<void>;
  recordError(runId: string | null, sourceId: string | null, kind: string, message: string, meta?: Record<string, unknown>): Promise<void>;
  touchSource(sourceId: string, status: string, at: Date): Promise<void>;
  /** Fontes ativas, de lojas ativas, que já passaram da frequência configurada. */
  dueSources(now: Date): Promise<{ store: Store; source: Source }[]>;
  // alertas
  recentPublishedOffers(since: Date): Promise<(AlertOffer & { offerLinkReady: boolean })[]>;
  activeAlerts(): Promise<AlertRecord[]>;
  lastNotification(alertId: string, offerId: string): Promise<NotificationRecord | null>;
  recordNotification(n: { alertId: string; offerId: string; priceCents: number; channel: string; status: "enviada" | "sem_provedor" | "falhou"; at: Date }): Promise<void>;
}
