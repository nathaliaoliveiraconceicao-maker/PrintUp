import type { createClient } from "@/lib/supabase/server";
import { buildViews, type OfferView } from "./listing";
import type { Observation } from "./pricing";

type Supa = Awaited<ReturnType<typeof createClient>>;

const OFFER_COLS = "id, product_id, price_cents, previous_price_cents, previous_basis, discount_pct, coupon_id, coupon_saved_cents, shipping_cents, in_stock, score, is_affiliate, featured, valid_until, last_checked_at";

/** Ofertas publicadas (o RLS já deixa passar só o que é público). Filtros e ordenação são feitos em código sobre no máximo 600 ofertas. */
export async function loadPublicOffers(supabase: Supa): Promise<OfferView[]> {
  const [offers, products, stores, coupons] = await Promise.all([
    supabase.from("offers").select(OFFER_COLS).limit(600),
    supabase.from("offer_products").select("id, store_id, title, brand, category, image_url, attrs, canonical_key").limit(600),
    supabase.from("offer_stores").select("id, code, name, disclosure").limit(50),
    supabase.from("offer_coupons").select("id, code, valid_until").limit(200),
  ]);
  return buildViews((offers.data ?? []) as never, (products.data ?? []) as never, (stores.data ?? []) as never, (coupons.data ?? []) as never);
}

export async function loadPriceHistory(supabase: Supa, productId: string, windowDays = 90, now: Date = new Date()): Promise<Observation[]> {
  const from = new Date(now.getTime() - windowDays * 86_400_000).toISOString();
  const { data } = await supabase.from("offer_price_history").select("price_cents, observed_at").eq("product_id", productId).gte("observed_at", from).order("observed_at").limit(1000);
  return (data ?? []).map((r: { price_cents: number; observed_at: string }) => ({ priceCents: Number(r.price_cents), at: new Date(r.observed_at) }));
}
