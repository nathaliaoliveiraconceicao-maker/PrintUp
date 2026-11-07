import { createAdminClient } from "@/lib/supabase/admin";
import { rowToOffer, rowToSource, rowToStore } from "./repo-supabase";
import type { OfferRow, Source, Store } from "./repo";

type Row = Record<string, unknown>;
const db = () => createAdminClient();

async function sourceNames(): Promise<Map<string, string>> {
  const { data } = await db().from("offer_sources").select("id, name");
  return new Map(((data ?? []) as Row[]).map((r) => [r.id as string, r.name as string]));
}
const withSource = (rows: Row[], names: Map<string, string>): Row[] => rows.map((r) => ({ ...r, offer_sources: { name: names.get(r.source_id as string) ?? null } }));

export async function loadOffersOverview() {
  const d = db();
  const since24 = new Date(Date.now() - 86_400_000).toISOString();
  const since7 = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const count = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;
  const [rev, pub, exp, err24, c7, c30, runs] = await Promise.all([
    count(d.from("offers").select("id", { count: "exact", head: true }).eq("status", "revisao")),
    count(d.from("offers").select("id", { count: "exact", head: true }).eq("status", "publicada")),
    count(d.from("offers").select("id", { count: "exact", head: true }).eq("status", "expirada")),
    count(d.from("offer_errors").select("id", { count: "exact", head: true }).gte("created_at", since24)),
    count(d.from("offer_clicks").select("id", { count: "exact", head: true }).gte("clicked_at", since7)),
    count(d.from("offer_clicks").select("id", { count: "exact", head: true }).gte("clicked_at", since30)),
    d.from("offer_runs").select("id, source_id, status, trigger, started_at, finished_at, stats, error").order("started_at", { ascending: false }).limit(8),
  ]);
  const { data: settingsRows } = await d.from("offer_settings").select("key, value");
  const names = await sourceNames();
  return { emRevisao: rev, publicadas: pub, expiradas: exp, erros24h: err24, cliques7d: c7, cliques30d: c30, runs: withSource((runs.data ?? []) as Row[], names), settings: Object.fromEntries((settingsRows ?? []).map((r: Row) => [r.key as string, r.value])) };
}

export type ReviewItem = { offer: OfferRow; title: string; brand: string | null; storeName: string; imageUrl: string | null; productUrl: string };

export async function loadReviewItems(status: "revisao" | "publicada"): Promise<ReviewItem[]> {
  const d = db();
  const { data } = await d.from("offers").select("*").eq("status", status).order("score", { ascending: false }).limit(100);
  const offers = (data ?? []) as Row[];
  if (offers.length === 0) return [];
  const [{ data: prods }, { data: stores }] = await Promise.all([d.from("offer_products").select("id, store_id, title, brand, image_url, product_url").in("id", [...new Set(offers.map((o) => o.product_id as string))]), d.from("offer_stores").select("id, name")]);
  const P = new Map(((prods ?? []) as Row[]).map((p) => [p.id as string, p])), S = new Map(((stores ?? []) as Row[]).map((s) => [s.id as string, s.name as string]));
  return offers.flatMap((r) => {
    const p = P.get(r.product_id as string);
    return p ? [{ offer: rowToOffer(r), title: p.title as string, brand: (p.brand as string) ?? null, imageUrl: (p.image_url as string) ?? null, productUrl: p.product_url as string, storeName: S.get(p.store_id as string) ?? "" }] : [];
  });
}

export async function loadStoresAndSources(): Promise<{ stores: Store[]; sources: Source[]; coupons: Row[] }> {
  const d = db();
  const [s, src, c] = await Promise.all([
    d.from("offer_stores").select("*").order("name"), d.from("offer_sources").select("*").order("created_at"), d.from("offer_coupons").select("*").order("created_at", { ascending: false }).limit(100),
  ]);
  const names = new Map(((s.data ?? []) as Row[]).map((x) => [x.id as string, x.name as string]));
  return { stores: ((s.data ?? []) as Row[]).map(rowToStore), sources: ((src.data ?? []) as Row[]).map(rowToSource), coupons: ((c.data ?? []) as Row[]).map((x) => ({ ...x, offer_stores: { name: names.get(x.store_id as string) } })) };
}

export async function loadRunsAndErrors() {
  const d = db();
  const [runs, errors] = await Promise.all([
    d.from("offer_runs").select("id, source_id, status, trigger, started_at, finished_at, stats, error").order("started_at", { ascending: false }).limit(40),
    d.from("offer_errors").select("id, source_id, kind, message, created_at").order("created_at", { ascending: false }).limit(60),
  ]);
  const names = await sourceNames();
  return { runs: withSource((runs.data ?? []) as Row[], names), errors: withSource((errors.data ?? []) as Row[], names) };
}

export async function loadAffiliateReport() {
  const d = db();
  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [clicks, conv, stores] = await Promise.all([
    d.from("offer_clicks").select("offer_id, store_id, clicked_at, origin").gte("clicked_at", since30).limit(20000),
    d.from("offer_conversions").select("id, store_id, reported_on, orders, commission_cents, status, note").order("reported_on", { ascending: false }).limit(100),
    d.from("offer_stores").select("id, name"),
  ]);
  const storeName = new Map(((stores.data ?? []) as Row[]).map((s) => [s.id as string, s.name as string]));
  const byStore = new Map<string, number>(), byOffer = new Map<string, number>(), byOrigin = new Map<string, number>();
  for (const c of (clicks.data ?? []) as Row[]) {
    byStore.set(c.store_id as string, (byStore.get(c.store_id as string) ?? 0) + 1);
    if (c.offer_id) byOffer.set(c.offer_id as string, (byOffer.get(c.offer_id as string) ?? 0) + 1);
    byOrigin.set(c.origin as string, (byOrigin.get(c.origin as string) ?? 0) + 1);
  }
  const topIds = [...byOffer].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const { data: topOffers } = topIds.length ? await d.from("offers").select("id, product_id").in("id", topIds.map(([id]) => id)) : { data: [] };
  const { data: topProds } = (topOffers ?? []).length ? await d.from("offer_products").select("id, title").in("id", (topOffers as Row[]).map((o) => o.product_id as string)) : { data: [] };
  const ptitle = new Map(((topProds ?? []) as Row[]).map((p) => [p.id as string, p.title as string]));
  const title = new Map(((topOffers ?? []) as Row[]).map((o) => [o.id as string, ptitle.get(o.product_id as string) ?? "—"]));
  const conversions = ((conv.data ?? []) as Row[]).map((c) => ({ ...c, storeName: storeName.get(c.store_id as string) ?? "—" } as Row & { storeName: string }));
  const sum = (status: string) => conversions.filter((c) => c.status === status).reduce((a, c) => a + Number(c.commission_cents), 0);
  return {
    total30d: (clicks.data ?? []).length,
    porLoja: [...byStore].map(([id, n]) => ({ loja: storeName.get(id) ?? "—", cliques: n })).sort((a, b) => b.cliques - a.cliques),
    porOrigem: [...byOrigin].map(([origem, n]) => ({ origem, cliques: n })),
    top: topIds.map(([id, n]) => ({ titulo: title.get(id) ?? "—", cliques: n })),
    conversions, comissaoInformadaCents: sum("informada"), comissaoConfirmadaCents: sum("confirmada"),
    stores: [...storeName].map(([id, name]) => ({ id, name })),
  };
}
