import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/card";
import { QuoteEditor, type EditorInitial } from "@/features/quotes/quote-editor";
import { ITEM_COLUMNS, QUOTE_COLUMNS, type QuoteItemRow, type QuoteRow } from "@/features/quotes/schema";
import { loadEditorData } from "@/features/quotes/server";
import { formatQuoteNumber } from "@/features/quotes/status";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Editar orçamento" };

const dec = (n: number) => String(n).replace(".", ",");

export default async function EditQuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("quotes").select(QUOTE_COLUMNS).eq("id", id).maybeSingle();
  if (!data) notFound();
  const q = data as QuoteRow;
  if (q.status !== "rascunho") redirect(`/orcamentos/${id}`);
  const [{ data: it }, editor] = await Promise.all([
    supabase.from("quote_items").select(ITEM_COLUMNS).eq("quote_id", id).order("position"),
    loadEditorData(supabase),
  ]);
  const initial: EditorInitial = {
    quoteId: q.id,
    issueDate: q.issue_date,
    customerId: q.customer_id,
    customer: { name: q.customer_name, phone: q.customer_phone ?? "", email: q.customer_email ?? "", document: q.customer_document ?? "" },
    validUntil: q.valid_until,
    productionDays: q.production_days === null ? "" : String(q.production_days),
    paymentTerms: q.payment_terms ?? "",
    notes: q.notes ?? "",
    discountType: q.discount_type,
    discountValue: q.discount_type === "nenhum" ? "" : dec(q.discount_value),
    items: ((it ?? []) as QuoteItemRow[]).map((i) => ({
      kind: i.kind, productId: i.product_id, name: i.name, description: i.description ?? "",
      quantity: i.quantity, unitPrice: i.unit_price, discountPercent: i.discount_percent,
    })),
  };
  return (
    <>
      <Link href={`/orcamentos/${id}`} className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft size={14} /> Orçamento {formatQuoteNumber(q.number)}</Link>
      <PageHeader title={`Editar orçamento ${formatQuoteNumber(q.number)}`} />
      <QuoteEditor products={editor.products} customers={editor.customers} defaults={editor.defaults} initial={initial} />
    </>
  );
}
