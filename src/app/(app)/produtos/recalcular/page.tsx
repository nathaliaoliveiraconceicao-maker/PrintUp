import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, PageHeader } from "@/components/ui/card";
import { CATALOG_COLUMNS, type CatalogProduct } from "@/features/products/catalog-schema";
import { RecalcButton } from "@/features/products/product-buttons";
import { loadStaleness } from "@/features/products/queries";
import { describeChange } from "@/features/products/refresh";
import { createClient } from "@/lib/supabase/server";
import { cn, formatBRL } from "@/lib/utils";

export const metadata = { title: "Recalcular produtos" };

export default async function RecalcPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("products").select(CATALOG_COLUMNS).is("archived_at", null).order("name");
  const products = (data ?? []) as CatalogProduct[];
  const staleMap = await loadStaleness(supabase, products);
  const rows = products.filter((p) => staleMap.get(p.id)?.stale);

  return (
    <>
      <Link href="/produtos" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft size={14} /> Meus produtos</Link>
      <PageHeader
        title="Recalcular com os custos de hoje"
        description="Compare antes e depois. Nada muda até você confirmar, e cada recálculo vira um novo item no histórico do produto."
        action={<RecalcButton ids={rows.map((p) => p.id)} label={`Recalcular ${rows.length} produto${rows.length === 1 ? "" : "s"}`} />}
      />
      {rows.length === 0 ? (
        <Card className="text-center text-muted">Todos os produtos estão de acordo com os custos atuais. 👍</Card>
      ) : (
        <ul className="space-y-3" data-testid="lista-recalcular">
          {rows.map((p) => {
            const s = staleMap.get(p.id)!;
            return (
              <li key={p.id}>
                <Card className="space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <Link href={`/produtos/${p.id}`} className="font-medium hover:underline">{p.name}</Link>
                    <RecalcButton ids={[p.id]} label="Recalcular só este" />
                  </div>
                  <ul className="space-y-0.5 text-sm text-muted">
                    {s.changes.map((c) => <li key={c.label}>{c.label}: <span className="num">{describeChange(c)}</span></li>)}
                  </ul>
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <Delta label="Custo" from={p.production_cost ?? 0} to={s.newCost} delta={s.costDelta} />
                    <Delta label="Preço de venda" from={p.sale_price ?? 0} to={s.newPrice} delta={s.priceDelta} />
                  </dl>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function Delta({ label, from, to, delta }: { label: string; from: number; to: number; delta: number }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="num">
        {formatBRL(from)} → <strong>{formatBRL(to)}</strong>{" "}
        <span className={cn("text-xs", delta > 0 ? "text-warn" : "text-ok")}>({delta > 0 ? "+" : ""}{formatBRL(delta)})</span>
      </dd>
    </div>
  );
}
