import { NextResponse } from "next/server";
import { parseOrigin, resolveRedirect, UUID_RE } from "@/features/offers/redirect";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Redirecionamento seguro: o destino vem do banco e é revalidado contra os hosts da loja; o clique é registrado (sem dados pessoais). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const origin = new URL(req.url).origin;
  const home = NextResponse.redirect(new URL("/ofertas", origin), 302);
  if (!UUID_RE.test(id)) return home;
  try {
    const db = createAdminClient();
    const { data: offer } = await db.from("offers").select("id, status, link_url, product_id, offer_products!inner(store_id)").eq("id", id).maybeSingle();
    const storeId = (offer as { offer_products?: { store_id?: string } } | null)?.offer_products?.store_id;
    const { data: store } = storeId ? await db.from("offer_stores").select("id, is_active, allowed_hosts").eq("id", storeId).maybeSingle() : { data: null };
    const url = resolveRedirect(offer as { status: string; link_url: string } | null, store as { is_active: boolean; allowed_hosts: string[] } | null);
    if (!url) return home;
    const o = parseOrigin(new URL(req.url).searchParams.get("o"));
    await db.from("offer_clicks").insert({ offer_id: id, store_id: storeId, origin: o });
    const res = NextResponse.redirect(url, 302);
    res.headers.set("Cache-Control", "no-store");
    res.headers.set("Referrer-Policy", "no-referrer");
    res.headers.set("X-Robots-Tag", "noindex");
    return res;
  } catch {
    return home;
  }
}
