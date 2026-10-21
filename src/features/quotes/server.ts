import type { SupabaseClient } from "@supabase/supabase-js";
import { formatPercent } from "@/lib/utils";
import { IMAGE_BUCKET } from "@/features/products/image-paths";
import { DEFAULT_BUSINESS, type BusinessRow } from "@/features/business/schema";
import { ITEM_COLUMNS, QUOTE_COLUMNS, type QuoteItemRow, type QuoteRow } from "./schema";
import type { QuotePdfData } from "./pdf";
import { toCents } from "./calc";

async function downloadImage(supabase: SupabaseClient, path: string | null): Promise<Uint8Array | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from(IMAGE_BUCKET).download(path);
  if (!data) return null;
  const bytes = new Uint8Array(await data.arrayBuffer());
  return bytes.length > 0 && bytes.length <= 2 * 1024 * 1024 ? bytes : null;
}

export async function loadBusiness(supabase: SupabaseClient): Promise<BusinessRow | null> {
  const { data } = await supabase.from("business_profiles").select("*").maybeSingle();
  return (data as BusinessRow | null) ?? null;
}

/**
 * Monta os dados do PDF a partir do RETRATO gravado no orçamento (não dos produtos atuais).
 * Custos internos nunca entram: `QuotePdfData` nem tem esses campos.
 */
export async function loadQuotePdfData(
  supabase: SupabaseClient,
  quoteId: string,
): Promise<{ quote: QuoteRow; data: QuotePdfData } | null> {
  const { data: q } = await supabase.from("quotes").select(QUOTE_COLUMNS).eq("id", quoteId).maybeSingle();
  if (!q) return null;
  const quote = q as QuoteRow;
  const [{ data: it }, business] = await Promise.all([
    supabase.from("quote_items").select(ITEM_COLUMNS).eq("quote_id", quoteId).order("position"),
    loadBusiness(supabase),
  ]);
  const items = (it ?? []) as QuoteItemRow[];
  const b = business ?? { ...DEFAULT_BUSINESS, user_id: "" };

  const [logo, photos] = await Promise.all([
    downloadImage(supabase, b.logo_path),
    Promise.all(items.map((i) => downloadImage(supabase, i.photo_path))),
  ]);

  const discountLabel =
    quote.discount_type === "percentual" ? `Desconto (${formatPercent(quote.discount_value)})` : quote.discount_type === "valor" ? "Desconto" : null;

  return {
    quote,
    data: {
      number: quote.number,
      issueDate: quote.issue_date,
      validUntil: quote.valid_until,
      productionDays: quote.production_days,
      business: {
        name: b.business_name,
        contactName: b.contact_name,
        phone: b.phone,
        email: b.email,
        city: b.city,
        brandColor: b.brand_color,
        logo,
      },
      customer: { name: quote.customer_name, phone: quote.customer_phone, email: quote.customer_email, document: quote.customer_document },
      items: items.map((i, idx) => ({
        name: i.name,
        description: i.description,
        quantity: i.quantity,
        unitPrice: i.unit_price,
        discountPercent: i.discount_percent,
        lineTotal: i.line_total,
        photo: photos[idx],
      })),
      subtotal: quote.subtotal,
      discountLabel,
      discountTotal: quote.discount_total,
      total: quote.total,
      paymentTerms: quote.payment_terms,
      notes: quote.notes,
    },
  };
}

/** Custo interno de um item × quantidade, em centavos. */
export const itemCostCents = (unitCost: number | null, quantity: number): number => (unitCost === null ? 0 : toCents(unitCost) * quantity);

/** Dados que o editor de orçamento precisa: catálogo ativo, clientes salvos e padrões do negócio. */
export async function loadEditorData(supabase: SupabaseClient) {
  const [products, customers, business] = await Promise.all([
    supabase.from("products").select("id, name, description, sale_price, stock_qty").is("archived_at", null).order("name"),
    supabase.from("customers").select("id, name, phone, email, document").order("name"),
    loadBusiness(supabase),
  ]);
  return {
    products: (products.data ?? []) as { id: string; name: string; description: string | null; sale_price: number | null; stock_qty: number }[],
    customers: (customers.data ?? []) as { id: string; name: string; phone: string | null; email: string | null; document: string | null }[],
    defaults: {
      validityDays: business?.default_validity_days ?? 7,
      paymentTerms: business?.default_payment_terms ?? "",
      notes: business?.default_notes ?? "",
    },
    hasBusiness: Boolean(business?.business_name),
  };
}
