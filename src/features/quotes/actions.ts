"use server";

import { revalidatePath } from "next/cache";
import { dbErrorMessage } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { loadBusiness, loadQuotePdfData, itemCostCents } from "./server";
import { buildQuotePdf } from "./pdf";
import { calculateQuote, fromCents } from "./calc";
import { ITEM_COLUMNS, QUOTE_COLUMNS, saveQuoteSchema, type QuoteActionState, type QuoteItemRow, type QuoteRow } from "./schema";
import { addDays, canTransition, todayBR, type QuoteStatus } from "./status";

const QUOTES_BUCKET = "quote-pdfs";

function refresh(id?: string) {
  revalidatePath("/orcamentos");
  if (id) revalidatePath(`/orcamentos/${id}`);
  revalidatePath("/");
}

type Db = Awaited<ReturnType<typeof createClient>>;

/**
 * Grava o orçamento. As contas são REFEITAS aqui (em centavos) a partir de quantidades e preços; o preço de tabela,
 * o nome do cadastro, a foto e o custo interno vêm do banco, nunca do navegador. O cabeçalho e os itens entram numa
 * única transação (RPC `save_quote`): ou grava tudo ou nada.
 */
export async function saveQuote(payload: unknown): Promise<QuoteActionState> {
  const parsed = saveQuoteSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const v = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada. Entre novamente." };

  let issueDate = todayBR();
  if (v.quoteId) {
    const { data: cur } = await supabase.from("quotes").select("status, issue_date").eq("id", v.quoteId).maybeSingle();
    if (!cur) return { error: "Orçamento não encontrado." };
    if (cur.status !== "rascunho") return { error: "Este orçamento já foi enviado e não pode ser alterado. Duplique-o para fazer mudanças." };
    issueDate = cur.issue_date as string;
  }
  if (v.validUntil < issueDate) return { error: "A validade não pode ser anterior à data de emissão." };

  // Dados dos produtos vêm do banco (RLS: só os do usuário).
  const productIds = [...new Set(v.items.map((i) => i.productId).filter((x): x is string => !!x))];
  const { data: prods } = productIds.length
    ? await supabase.from("products").select("id, name, photo_path, sale_price, production_cost").in("id", productIds)
    : { data: [] };
  const byId = new Map(
    ((prods ?? []) as { id: string; name: string; photo_path: string | null; sale_price: number | null; production_cost: number | null }[]).map((p) => [p.id, p]),
  );
  for (const i of v.items) {
    if (i.kind === "produto" && !byId.has(i.productId as string)) return { error: "Um dos produtos não foi encontrado. Atualize a página e tente de novo." };
  }

  const totals = calculateQuote(
    v.items.map((i) => ({ quantity: i.quantity, unitPrice: i.unitPrice, discountPercent: i.discountPercent })),
    v.discount,
  );
  if (totals.discountCapped) return { error: "O desconto não pode ser maior que o subtotal." };

  let costCents = 0;
  let anyCost = false;
  const items = v.items.map((i, idx) => {
    const p = i.kind === "produto" ? byId.get(i.productId as string) : undefined;
    if (p && p.production_cost !== null) {
      anyCost = true;
      costCents += itemCostCents(p.production_cost, i.quantity);
    }
    return {
      kind: i.kind,
      product_id: p ? p.id : null,
      name: i.name,
      description: i.description ?? null,
      photo_path: p?.photo_path ?? null,
      quantity: i.quantity,
      list_price: p?.sale_price ?? null,
      unit_price: i.unitPrice,
      discount_percent: i.discountPercent,
      line_total: totals.lineTotals[idx],
      unit_cost: p?.production_cost ?? null,
    };
  });

  let customerId = v.customerId ?? null;
  if (!customerId && v.saveCustomer) {
    const { data: c } = await supabase
      .from("customers")
      .insert({ name: v.customer.name, phone: v.customer.phone ?? null, email: v.customer.email ?? null, document: v.customer.document ?? null })
      .select("id")
      .single();
    customerId = (c?.id as string | undefined) ?? null;
  }

  const { data: id, error } = await supabase.rpc("save_quote", {
    p_quote_id: v.quoteId ?? null,
    p_quote: {
      customer_id: customerId,
      customer_name: v.customer.name,
      customer_phone: v.customer.phone ?? null,
      customer_email: v.customer.email ?? null,
      customer_document: v.customer.document ?? null,
      issue_date: issueDate,
      valid_until: v.validUntil,
      production_days: v.productionDays ?? null,
      payment_terms: v.paymentTerms ?? null,
      notes: v.notes ?? null,
      discount_type: v.discount.type,
      discount_value: v.discount.type === "nenhum" ? 0 : v.discount.value,
      subtotal: totals.subtotal,
      discount_total: totals.discountTotal,
      total: totals.total,
      internal_cost_total: anyCost ? fromCents(costCents) : null,
    },
    p_items: items,
  });
  if (error || !id) return { error: dbErrorMessage(error ?? {}) };

  refresh(id as string);
  return { ok: true, quoteId: id as string };
}

async function loadQuote(supabase: Db, id: string): Promise<QuoteRow | null> {
  const { data } = await supabase.from("quotes").select(QUOTE_COLUMNS).eq("id", id).maybeSingle();
  return (data as QuoteRow | null) ?? null;
}

export async function setQuoteStatus(id: string, to: QuoteStatus): Promise<QuoteActionState> {
  const supabase = await createClient();
  const q = await loadQuote(supabase, id);
  if (!q) return { error: "Orçamento não encontrado." };
  if (!canTransition(q.status, to)) return { error: "Essa mudança de status não é permitida." };
  const now = new Date().toISOString();
  const patch =
    to === "enviado" ? { status: to, sent_at: now, decided_at: null }
    : to === "rascunho" ? { status: to, sent_at: null, decided_at: null }
    : { status: to, decided_at: now, ...(q.sent_at ? {} : { sent_at: now }) };
  const { error } = await supabase.from("quotes").update(patch).eq("id", id);
  if (error) return { error: dbErrorMessage(error) };
  refresh(id);
  return { ok: true, quoteId: id };
}

/** Cópia como RASCUNHO novo: datas renovadas e itens com o retrato do original (preços não são reconsultados). */
export async function duplicateQuote(id: string): Promise<QuoteActionState> {
  const supabase = await createClient();
  const q = await loadQuote(supabase, id);
  if (!q) return { error: "Orçamento não encontrado." };
  const [{ data: it }, business] = await Promise.all([
    supabase.from("quote_items").select(ITEM_COLUMNS).eq("quote_id", id).order("position"),
    loadBusiness(supabase),
  ]);
  const items = (it ?? []) as QuoteItemRow[];
  const today = todayBR();
  const { data: newId, error } = await supabase.rpc("save_quote", {
    p_quote_id: null,
    p_quote: {
      customer_id: q.customer_id,
      customer_name: q.customer_name,
      customer_phone: q.customer_phone,
      customer_email: q.customer_email,
      customer_document: q.customer_document,
      issue_date: today,
      valid_until: addDays(today, business?.default_validity_days ?? 7),
      production_days: q.production_days,
      payment_terms: q.payment_terms,
      notes: q.notes,
      discount_type: q.discount_type,
      discount_value: q.discount_value,
      subtotal: q.subtotal,
      discount_total: q.discount_total,
      total: q.total,
      internal_cost_total: q.internal_cost_total,
    },
    p_items: items.map((i) => ({
      kind: i.kind, product_id: i.product_id, name: i.name, description: i.description, photo_path: i.photo_path,
      quantity: i.quantity, list_price: i.list_price, unit_price: i.unit_price, discount_percent: i.discount_percent,
      line_total: i.line_total, unit_cost: i.unit_cost,
    })),
  });
  if (error || !newId) return { error: dbErrorMessage(error ?? {}) };
  refresh(newId as string);
  return { ok: true, quoteId: newId as string };
}

/** Só rascunhos podem ser excluídos; orçamentos enviados ou decididos ficam no histórico. */
export async function deleteQuote(id: string): Promise<QuoteActionState> {
  const supabase = await createClient();
  const q = await loadQuote(supabase, id);
  if (!q) return { error: "Orçamento não encontrado." };
  if (q.status !== "rascunho") return { error: "Só rascunhos podem ser excluídos. Os demais ficam no histórico." };
  const { error } = await supabase.from("quotes").delete().eq("id", id);
  if (error) return { error: dbErrorMessage(error) };
  if (q.share_path) await supabase.storage.from(QUOTES_BUCKET).remove([q.share_path]);
  refresh();
  return { ok: true };
}

/**
 * Gera o PDF, guarda no Storage privado e devolve um link temporário para mandar ao cliente (WhatsApp, e-mail…).
 * O link vale até o fim da validade do orçamento (mínimo 1 dia, máximo 30).
 */
export async function createShareLink(id: string): Promise<QuoteActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada. Entre novamente." };
  const loaded = await loadQuotePdfData(supabase, id);
  if (!loaded) return { error: "Orçamento não encontrado." };
  const { quote, data } = loaded;

  const pdf = await buildQuotePdf(data);
  const path = `${user.id}/${quote.id}.pdf`;
  // Sem upsert (não há policy de UPDATE no bucket): remove a versão anterior e envia de novo.
  await supabase.storage.from(QUOTES_BUCKET).remove([path]);
  const { error: upErr } = await supabase.storage.from(QUOTES_BUCKET).upload(path, pdf, { contentType: "application/pdf" });
  if (upErr) return { error: "Não foi possível gerar o link. Tente novamente." };

  const days = Math.min(30, Math.max(1, Math.ceil((new Date(`${quote.valid_until}T23:59:59-03:00`).getTime() - Date.now()) / 86_400_000)));
  const { data: signed } = await supabase.storage.from(QUOTES_BUCKET).createSignedUrl(path, days * 86_400, { download: `orcamento-${String(quote.number).padStart(4, "0")}.pdf` });
  if (!signed?.signedUrl) return { error: "Não foi possível gerar o link. Tente novamente." };

  await supabase.from("quotes").update({ share_path: path, shared_at: new Date().toISOString() }).eq("id", id);
  refresh(id);
  return { ok: true, quoteId: id, url: signed.signedUrl };
}
