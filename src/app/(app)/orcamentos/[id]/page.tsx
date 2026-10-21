import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card, PageHeader } from "@/components/ui/card";
import { QuoteActions } from "@/features/quotes/quote-actions";
import { ITEM_COLUMNS, QUOTE_COLUMNS, type QuoteItemRow, type QuoteRow } from "@/features/quotes/schema";
import { loadBusiness } from "@/features/quotes/server";
import { StatusBadge } from "@/features/quotes/status-badge";
import { effectiveStatus, formatDateBR, formatQuoteNumber } from "@/features/quotes/status";
import { createClient } from "@/lib/supabase/server";
import { formatBRL, formatDateTime, formatPercent } from "@/lib/utils";

export const metadata = { title: "Orçamento" };

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("quotes").select(QUOTE_COLUMNS).eq("id", id).maybeSingle();
  if (!data) notFound();
  const q = data as QuoteRow;
  const [{ data: it }, business, { data: linked }] = await Promise.all([
    supabase.from("quote_items").select(ITEM_COLUMNS).eq("quote_id", id).order("position"),
    loadBusiness(supabase),
    supabase.from("orders").select("id").eq("quote_id", id).maybeSingle(),
  ]);
  const items = (it ?? []) as QuoteItemRow[];
  const shown = effectiveStatus(q.status, q.valid_until);
  // Visão do VENDEDOR: custo e lucro aparecem só aqui, nunca no PDF.
  const cost = q.internal_cost_total;
  const profit = cost !== null ? q.total - cost : null;

  return (
    <>
      <Link href="/orcamentos" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft size={14} /> Orçamentos</Link>
      <PageHeader title={`Orçamento ${formatQuoteNumber(q.number)}`} description={`${q.customer_name} · emitido em ${formatDateBR(q.issue_date)} · válido até ${formatDateBR(q.valid_until)}`} action={<StatusBadge status={shown} />} />

      {shown === "expirado" && (
        <Card className="mb-4 border-warn/40 bg-accent-soft/50 text-sm">A validade deste orçamento já passou. Duplique-o para emitir um novo com datas atualizadas.</Card>
      )}

      <Card className="mb-6">
        <QuoteActions
          id={id}
          status={q.status}
          orderId={(linked as { id: string } | null)?.id ?? null}
          share={{
            customerName: q.customer_name,
            customerPhone: q.customer_phone,
            businessName: business?.business_name ?? null,
            number: formatQuoteNumber(q.number),
            total: formatBRL(q.total),
            validUntil: formatDateBR(q.valid_until),
          }}
        />
        {q.shared_at && <p className="mt-3 text-xs text-muted">Último link gerado em {formatDateTime(q.shared_at)}.</p>}
      </Card>

      <Card className="mb-6 space-y-4" data-testid="detalhe-orcamento">
        <ul className="divide-y divide-line">
          {items.map((i) => (
            <li key={i.id} className="flex items-start justify-between gap-3 py-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium">{i.name}</p>
                {i.description && <p className="text-xs text-muted">{i.description}</p>}
                <p className="num text-xs text-muted">
                  {i.quantity} × {formatBRL(i.unit_price)}
                  {i.discount_percent > 0 ? ` − ${formatPercent(i.discount_percent)}` : ""}
                </p>
              </div>
              <span className="num font-medium">{formatBRL(i.line_total)}</span>
            </li>
          ))}
        </ul>
        <dl className="space-y-1 border-t border-line pt-3 text-sm">
          <Line label="Subtotal" value={formatBRL(q.subtotal)} />
          {q.discount_total > 0 && <Line label={q.discount_type === "percentual" ? `Desconto (${formatPercent(q.discount_value)})` : "Desconto"} value={`- ${formatBRL(q.discount_total)}`} />}
          <div className="flex items-baseline justify-between pt-1">
            <dt className="font-semibold">Total</dt>
            <dd className="num text-2xl font-semibold text-accent-strong">{formatBRL(q.total)}</dd>
          </div>
        </dl>
        {(q.production_days !== null || q.payment_terms || q.notes) && (
          <dl className="space-y-1 border-t border-line pt-3 text-sm">
            {q.production_days !== null && <Line label="Prazo de produção" value={q.production_days === 0 ? "Imediato" : `${q.production_days} dia(s)`} />}
            {q.payment_terms && <div><dt className="text-muted">Pagamento</dt><dd>{q.payment_terms}</dd></div>}
            {q.notes && <div><dt className="text-muted">Observações</dt><dd>{q.notes}</dd></div>}
          </dl>
        )}
      </Card>

      {cost !== null && profit !== null && (
        <Card className="space-y-1 bg-paper text-sm" data-testid="visao-vendedor">
          <p className="font-medium">Só para você (não aparece no PDF)</p>
          <Line label="Custo de produção dos produtos" value={formatBRL(cost)} />
          <Line label="Resultado sobre o custo" value={formatBRL(profit)} />
          <p className="text-xs text-muted">Calculado com o custo gravado quando o orçamento foi salvo. Não considera taxas e impostos de venda.</p>
        </Card>
      )}
    </>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className="num">{value}</dd>
    </div>
  );
}
