import Link from "next/link";
import { Calculator } from "lucide-react";
import { DeleteButton } from "@/components/delete-button";
import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";
import { deleteProduct } from "@/features/products/actions";
import type { PricingRow, ProductRow } from "@/features/products/schema";
import { DEFAULT_SETTINGS, type SettingsRow } from "@/features/settings/schema";
import { createClient } from "@/lib/supabase/server";
import { formatBRL, formatDateTime, formatPercent } from "@/lib/utils";

export const metadata = { title: "Produtos" };

export default async function ProductsPage() {
  const supabase = await createClient();
  const [products, latest, settings] = await Promise.all([
    supabase.from("products").select("id, name, notes, created_at").order("name"),
    supabase.from("latest_pricings").select("product_id, unit_price, unit_cost, unit_profit, margin_percent, quantity, created_at"),
    supabase.from("cost_settings").select("margin_percent").maybeSingle(),
  ]);
  const rows = (products.data ?? []) as ProductRow[];
  const byProduct = new Map(((latest.data ?? []) as PricingRow[]).map((p) => [p.product_id, p]));
  const target = (settings.data as Pick<SettingsRow, "margin_percent"> | null)?.margin_percent ?? DEFAULT_SETTINGS.margin_percent;

  return (
    <>
      <PageHeader
        title="Produtos"
        description="Cada produto guarda o histórico dos preços calculados."
        action={<Button asChild><Link href="/calculadora"><Calculator size={18} />Precificar</Link></Button>}
      />
      {rows.length === 0 ? (
        <Card className="text-center text-muted">
          Nenhum produto ainda. Faça um cálculo na <Link href="/calculadora" className="font-medium text-accent-strong underline">calculadora</Link> e salve o preço.
        </Card>
      ) : (
        <ul className="space-y-3">
          {rows.map((p) => {
            const l = byProduct.get(p.id);
            const below = l && l.margin_percent < target - 1;
            return (
              <li key={p.id}>
                <Card className="flex items-center gap-3 p-4">
                  <Link href={`/produtos/${p.id}`} className="min-w-0 flex-1">
                    <p className="truncate font-medium">{p.name}</p>
                    {l ? (
                      <p className="num text-sm text-muted">
                        {formatBRL(l.unit_price)} · margem {formatPercent(l.margin_percent)} · {formatDateTime(l.created_at)}
                      </p>
                    ) : (
                      <p className="text-sm text-muted">Sem precificação</p>
                    )}
                    {below && (
                      <span className="mt-1 inline-block rounded-full bg-accent-soft px-2 py-0.5 text-xs text-warn">
                        Abaixo da sua margem padrão ({formatPercent(target)})
                      </span>
                    )}
                  </Link>
                  <DeleteButton what={p.name} action={deleteProduct.bind(null, p.id)} />
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
