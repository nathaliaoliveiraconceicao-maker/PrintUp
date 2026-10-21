import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Calculator } from "lucide-react";
import { DeleteButton } from "@/components/delete-button";
import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";
import { deletePricing, deleteProduct } from "@/features/products/actions";
import type { PricingRow, ProductRow } from "@/features/products/schema";
import { COST_LABELS } from "@/lib/pricing/labels";
import { createClient } from "@/lib/supabase/server";
import { formatBRL, formatDateTime, formatPercent } from "@/lib/utils";

export const metadata = { title: "Produto" };

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: product } = await supabase.from("products").select("id, name, notes, created_at").eq("id", id).maybeSingle();
  if (!product) notFound();
  const { data } = await supabase.from("pricings").select("*").eq("product_id", id).order("created_at", { ascending: false });
  const pricings = (data ?? []) as PricingRow[];

  async function remove() {
    "use server";
    await deleteProduct(id);
    redirect("/produtos");
  }

  return (
    <>
      <Link href="/produtos" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft size={14} /> Produtos
      </Link>
      <PageHeader
        title={(product as ProductRow).name}
        description={`${pricings.length} precificação(ões) salva(s)`}
        action={
          <div className="flex items-center gap-1">
            <Button asChild><Link href="/calculadora"><Calculator size={18} />Nova precificação</Link></Button>
            <DeleteButton what={(product as ProductRow).name} action={remove} />
          </div>
        }
      />
      {pricings.length === 0 ? (
        <Card className="text-center text-muted">Este produto ainda não tem precificações.</Card>
      ) : (
        <ul className="space-y-4">
          {pricings.map((p, i) => (
            <li key={p.id}>
              <Card className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted">
                      {formatDateTime(p.created_at)}{i === 0 && " · mais recente"}
                    </p>
                    <p className="num text-3xl font-semibold text-accent-strong">{formatBRL(p.unit_price)}</p>
                    <p className="text-xs text-muted">preço por unidade · lote de {p.quantity}</p>
                  </div>
                  <DeleteButton what="esta precificação" action={deletePricing.bind(null, p.id, id)} />
                </div>
                <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <Stat label="Custo / unid." value={formatBRL(p.unit_cost)} />
                  <Stat label="Lucro / unid." value={formatBRL(p.unit_profit)} />
                  <Stat label="Margem" value={formatPercent(p.margin_percent)} />
                  <Stat label="Markup" value={formatPercent(p.markup_percent)} />
                </dl>
                <p className="text-xs text-muted">
                  {[p.printer_name && `Impressora: ${p.printer_name}`, p.filament_name && `Filamento: ${p.filament_name}`, p.pricing_mode === "margin" ? "Método: margem" : "Método: markup"]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <details className="text-sm">
                  <summary className="cursor-pointer font-medium text-accent-strong">Composição do custo</summary>
                  <ul className="mt-2 divide-y divide-line">
                    {COST_LABELS.map(([key, label]) => (
                      <li key={key} className="flex justify-between py-1.5">
                        <span className={p.result.unit[key] === 0 ? "text-muted" : ""}>{label}</span>
                        <span className="num">{formatBRL(p.result.unit[key])}</span>
                      </li>
                    ))}
                    <li className="flex justify-between py-1.5 text-muted">
                      <span>Taxas + impostos / unid.</span>
                      <span className="num">{formatBRL(p.result.unitFees + p.result.unitTaxes)}</span>
                    </li>
                  </ul>
                </details>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="num font-medium">{value}</dd>
    </div>
  );
}
