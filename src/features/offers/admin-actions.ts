"use server";

import { revalidatePath } from "next/cache";
import { currentAdmin } from "@/features/admin/guard";
import { dbErrorMessage, zodToState, type FormState } from "@/lib/forms";
import { createAdminClient } from "@/lib/supabase/admin";
import { conversionSchema, couponSchema, settingsSchema, sourceSchema, storeSchema } from "./admin-schema";
import { runSource } from "./collector";
import { connectorFor } from "./connectors/registry";
import { parseFeedText } from "./connectors/feed";
import { envMissing } from "./connectors/types";
import { UUID_RE } from "./redirect";
import { rowToSource, rowToStore } from "./repo-supabase";
import { offersRepo } from "./server";

const DENIED: FormState = { error: "Acesso restrito." };
const touch = () => { revalidatePath("/admin/ofertas", "layout"); revalidatePath("/ofertas"); };

/** Toda ação administrativa deixa rastro na auditoria (com quem fez), sem dados sensíveis. */
async function audit(userId: string, action: string, entity: string, entityId: string | null, details: Record<string, unknown> = {}) {
  await createAdminClient().from("admin_audit_log").insert({ actor_id: userId, actor_kind: "superadmin", action, entity, entity_id: entityId, details });
}

export async function saveOfferSettings(_: FormState, fd: FormData): Promise<FormState> {
  const ctx = await currentAdmin();
  if (!ctx) return DENIED;
  const p = settingsSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return zodToState(p.error);
  const v = p.data;
  const db = createAdminClient();
  const rows = [
    ["auto_publish", v.autoPublish], ["min_score_publish", Math.round(v.minScorePublish)], ["min_score_review", Math.round(v.minScoreReview)],
    ["expire_after_hours", Math.round(v.expireAfterHours)], ["history_window_days", Math.round(v.historyWindowDays)],
    ["weights", { discount: v.w_discount, history: v.w_history, relevance: v.w_relevance, availability: v.w_availability, store: v.w_store, quality: v.w_quality, coupon: v.w_coupon, freshness: v.w_freshness }],
  ].map(([key, value]) => ({ key, value, updated_at: new Date().toISOString() }));
  const { error } = await db.from("offer_settings").upsert(rows);
  if (error) return { error: dbErrorMessage(error) };
  await audit(ctx.userId, "ofertas.configuracao", "offer_settings", null, { publicacao_automatica: v.autoPublish, nota_publicar: v.minScorePublish, nota_revisao: v.minScoreReview });
  touch();
  return { ok: v.autoPublish ? "Configurações salvas. Atenção: a publicação automática está LIGADA." : "Configurações salvas." };
}

export async function saveStore(id: string | null, _: FormState, fd: FormData): Promise<FormState> {
  const ctx = await currentAdmin();
  if (!ctx) return DENIED;
  const p = storeSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return zodToState(p.error);
  const { code, ...rest } = p.data;
  if (rest.kind === "simulado" && process.env.OFFERS_ALLOW_SIMULATED !== "sim") return { error: "Lojas simuladas só existem em desenvolvimento." };
  const db = createAdminClient();
  const row = { ...rest, disclosure: rest.disclosure ?? undefined, is_simulated: rest.kind === "simulado" };
  const { error } = id ? await db.from("offer_stores").update(row).eq("id", id) : await db.from("offer_stores").insert({ code, ...row });
  if (error) return { error: error.code === "23505" ? "Já existe uma loja com este código." : dbErrorMessage(error) };
  await audit(ctx.userId, id ? "ofertas.loja.alterada" : "ofertas.loja.criada", "offer_stores", id, { codigo: code, ativa: rest.is_active });
  touch();
  return { ok: "Loja salva." };
}

export async function saveSource(id: string | null, _: FormState, fd: FormData): Promise<FormState> {
  const ctx = await currentAdmin();
  if (!ctx) return DENIED;
  const p = sourceSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return zodToState(p.error);
  const { confirmUnverified, ...row } = p.data;
  const connector = connectorFor(row.connector);
  if (!connector) return { error: "Este conector não está disponível neste ambiente." };
  if (row.is_active) {
    const missing = envMissing(connector, process.env);
    if (missing.length) return { error: `Antes de ativar, configure no servidor as variáveis: ${missing.join(", ")}.` };
    if (connector.status === "preparado_nao_verificado" && !confirmUnverified) return { error: "Este conector está preparado, mas ainda não foi verificado contra a documentação oficial. Marque a confirmação para ativar." };
  }
  const db = createAdminClient();
  const { error } = id ? await db.from("offer_sources").update(row).eq("id", id) : await db.from("offer_sources").insert(row);
  if (error) return { error: dbErrorMessage(error) };
  await audit(ctx.userId, id ? "ofertas.fonte.alterada" : "ofertas.fonte.criada", "offer_sources", id, { conector: row.connector, ativa: row.is_active });
  touch();
  return { ok: "Fonte salva." };
}

export async function deleteSource(id: string): Promise<FormState> {
  const ctx = await currentAdmin();
  if (!ctx || !UUID_RE.test(id)) return DENIED;
  const { error } = await createAdminClient().from("offer_sources").delete().eq("id", id);
  if (error) return { error: dbErrorMessage(error) };
  await audit(ctx.userId, "ofertas.fonte.removida", "offer_sources", id);
  touch();
  return { ok: "Fonte removida." };
}

async function loadSourceAndStore(id: string) {
  const db = createAdminClient();
  const { data: s } = await db.from("offer_sources").select("*").eq("id", id).maybeSingle();
  if (!s) return null;
  const { data: st } = await db.from("offer_stores").select("*").eq("id", s.store_id).maybeSingle();
  return st ? { source: rowToSource(s as Record<string, unknown>), store: rowToStore(st as Record<string, unknown>) } : null;
}

/** "Executar agora": usa o mesmo coletor da rotina agendada (mesmas regras, travas e limites). */
export async function runSourceNow(id: string): Promise<FormState> {
  const ctx = await currentAdmin();
  if (!ctx || !UUID_RE.test(id)) return DENIED;
  const x = await loadSourceAndStore(id);
  if (!x) return { error: "Fonte não encontrada." };
  const connector = connectorFor(x.source.connector);
  if (!connector) return { error: "Conector indisponível neste ambiente." };
  const missing = envMissing(connector, process.env);
  if (missing.length) return { error: `Faltam variáveis de ambiente no servidor: ${missing.join(", ")}.` };
  const r = await runSource({ repo: offersRepo(), connector, env: process.env }, x.store, x.source, "manual");
  await audit(ctx.userId, "ofertas.fonte.executada", "offer_sources", id, { status: r.status });
  touch();
  if (r.status === "ignorada") return { error: r.error ?? "Já existe uma execução em andamento." };
  if (r.status === "falhou") return { error: `A coleta falhou: ${r.error ?? "veja Execuções e erros"}.` };
  return { ok: `Coleta ${r.status === "ok" ? "concluída" : "parcial"}: ${r.stats.vistos} produtos vistos, ${r.stats.ofertas_criadas} ofertas novas, ${r.stats.ofertas_atualizadas} atualizadas, ${r.stats.em_revisao} em revisão.` };
}

/** Importação manual/autorizada: cole um CSV ou JSON (ex.: exportação do seu portal de afiliados). Passa pelas MESMAS regras da coleta. */
export async function importFeed(_: FormState, fd: FormData): Promise<FormState> {
  const ctx = await currentAdmin();
  if (!ctx) return DENIED;
  const id = String(fd.get("sourceId") ?? "");
  const text = String(fd.get("text") ?? "");
  if (!UUID_RE.test(id)) return { error: "Escolha a fonte." };
  if (text.trim().length < 10 || text.length > 2_000_000) return { error: "Cole o conteúdo do arquivo (CSV ou JSON)." };
  const x = await loadSourceAndStore(id);
  if (!x) return { error: "Fonte não encontrada." };
  let parsed;
  try { parsed = parseFeedText(text); } catch (e) { return { error: (e as Error).message }; }
  if (parsed.products.length === 0) return { error: `Nenhuma linha válida (${parsed.rejected.length} recusadas). Confira as colunas: título, preço, url.` };
  const r = await runSource({ repo: offersRepo(), env: process.env }, x.store, x.source, "importacao", parsed.products);
  await audit(ctx.userId, "ofertas.importacao", "offer_sources", id, { linhas: parsed.products.length, recusadas: parsed.rejected.length, status: r.status });
  touch();
  if (r.status === "ignorada") return { error: r.error ?? "Já existe uma execução em andamento." };
  return { ok: `Importação ${r.status}: ${r.stats.vistos} linhas, ${r.stats.ofertas_criadas} ofertas novas, ${r.stats.ofertas_atualizadas} atualizadas, ${r.stats.ignorados} ignoradas${parsed.rejected.length ? `, ${parsed.rejected.length} linhas recusadas` : ""}.` };
}

export async function saveCoupon(_: FormState, fd: FormData): Promise<FormState> {
  const ctx = await currentAdmin();
  if (!ctx) return DENIED;
  const p = couponSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return zodToState(p.error);
  const v = p.data;
  const { error } = await createAdminClient().from("offer_coupons").insert({
    store_id: v.storeId, code: v.code, kind: v.kind, value: v.value, min_purchase_cents: v.minPurchase ? Math.round(v.minPurchase * 100) : null, max_discount_cents: v.maxDiscount ? Math.round(v.maxDiscount * 100) : null,
    valid_until: v.validUntil ? new Date(`${v.validUntil}T23:59:59-03:00`).toISOString() : null, source: v.source,
  });
  if (error) return { error: error.code === "23505" ? "Já existe este cupom nesta loja." : dbErrorMessage(error) };
  await audit(ctx.userId, "ofertas.cupom.criado", "offer_coupons", null, { codigo: v.code });
  touch();
  return { ok: "Cupom salvo. Ele só entra nas ofertas depois da próxima coleta." };
}

export async function setCouponActive(id: string, active: boolean): Promise<FormState> {
  const ctx = await currentAdmin();
  if (!ctx || !UUID_RE.test(id)) return DENIED;
  const { error } = await createAdminClient().from("offer_coupons").update({ is_active: active }).eq("id", id);
  if (error) return { error: dbErrorMessage(error) };
  await audit(ctx.userId, active ? "ofertas.cupom.ativado" : "ofertas.cupom.desativado", "offer_coupons", id);
  touch();
  return { ok: active ? "Cupom ativado." : "Cupom desativado." };
}

export type ReviewAction = "aprovar" | "rejeitar" | "despublicar" | "destacar" | "remover_destaque";

export async function reviewOffer(id: string, action: ReviewAction): Promise<FormState> {
  const ctx = await currentAdmin();
  if (!ctx || !UUID_RE.test(id)) return DENIED;
  const db = createAdminClient();
  const { data: offer } = await db.from("offers").select("id, status, is_simulated").eq("id", id).maybeSingle();
  if (!offer) return { error: "Oferta não encontrada." };
  const now = new Date().toISOString();
  const patch: Record<string, unknown> | null =
    action === "aprovar" ? (offer.status === "revisao" ? { status: "publicada", reviewed_at: now, last_checked_at: now } : null)
    : action === "rejeitar" ? (["revisao", "publicada"].includes(offer.status as string) ? { status: "rejeitada", reviewed_at: now } : null)
    : action === "despublicar" ? (offer.status === "publicada" ? { status: "expirada" } : null)
    : action === "destacar" ? (offer.status === "publicada" ? { featured: true } : null)
    : { featured: false };
  if (!patch) return { error: "Esta ação não vale para o estado atual da oferta." };
  const { error } = await db.from("offers").update(patch).eq("id", id);
  if (error) return { error: error.code === "P0001" ? error.message : dbErrorMessage(error) };
  await audit(ctx.userId, `ofertas.oferta.${action}`, "offers", id);
  touch();
  return { ok: { aprovar: "Oferta publicada.", rejeitar: "Oferta rejeitada.", despublicar: "Oferta despublicada.", destacar: "Oferta destacada.", remover_destaque: "Destaque removido." }[action] };
}

export async function saveConversion(_: FormState, fd: FormData): Promise<FormState> {
  const ctx = await currentAdmin();
  if (!ctx) return DENIED;
  const p = conversionSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return zodToState(p.error);
  const v = p.data;
  const { error } = await createAdminClient().from("offer_conversions").insert({ store_id: v.storeId, reported_on: v.reportedOn, orders: Math.round(v.orders), commission_cents: Math.round(v.commission * 100), status: v.status, note: v.note ?? null });
  if (error) return { error: dbErrorMessage(error) };
  await audit(ctx.userId, "ofertas.conversao.registrada", "offer_conversions", null, { status: v.status });
  touch();
  return { ok: v.status === "confirmada" ? "Registrado como comissão confirmada." : "Registrado como informada (ainda não confirmada)." };
}
