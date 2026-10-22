import Link from "next/link";
import { Plus } from "lucide-react";
import { DeleteButton } from "@/components/delete-button";
import { Button } from "@/components/ui/button";
import { FilamentTabs } from "@/components/filament-tabs";
import { Card, PageHeader } from "@/components/ui/card";
import { deleteFilament } from "@/features/filaments/actions";
import type { FilamentRow } from "@/features/filaments/schema";
import { SPOOL_COLUMNS, type SpoolRow } from "@/features/stock/schema";
import { stockByFilament } from "@/features/stock/summary";
import { createClient } from "@/lib/supabase/server";
import { formatBRL } from "@/lib/utils";

export const metadata = { title: "Filamentos" };

export default async function FilamentsPage() {
  const supabase = await createClient();
  const [{ data }, spoolsRes] = await Promise.all([supabase.from("filaments").select("*").order("name"), supabase.from("filament_spools").select(SPOOL_COLUMNS)]);
  const filaments = (data ?? []) as FilamentRow[];
  const stock = new Map(stockByFilament(filaments.map((f) => ({ id: f.id, name: f.name, material: f.material, color: f.color, min_stock_g: f.min_stock_g ?? 250 })), (spoolsRes.data ?? []) as SpoolRow[]).map((s) => [s.filament.id, s]));

  return (
    <>
      <PageHeader
        title="Filamentos"
        description="Cadastro dos filamentos (o preço por kg alimenta o custo de material) e o saldo de cada um."
        action={<Button asChild><Link href="/filamentos/novo"><Plus size={18} />Novo filamento</Link></Button>}
      />
      <FilamentTabs current="/filamentos" />
      {filaments.length === 0 ? (
        <Card className="text-center text-muted">Nenhum filamento ainda.</Card>
      ) : (
        <ul className="space-y-3">
          {filaments.map((f) => (
            <li key={f.id}>
              <Card className="flex items-center gap-3 p-4">
                <Link href={`/filamentos/${f.id}`} className="min-w-0 flex-1">
                  <p className="truncate font-medium">{f.name}</p>
                  <p className="num text-sm text-muted">
                    {f.material}{f.color ? ` · ${f.color}` : ""} · {formatBRL(f.price_per_kg)}/kg
                  </p>
                  {(() => {
                    const s = stock.get(f.id);
                    if (!s || s.spools === 0) return <p className="text-xs text-muted">Sem bobinas cadastradas · <span className="underline">controlar estoque</span></p>;
                    return <p className={`num text-xs ${s.low ? "text-warn" : "text-muted"}`}>Disponível: {(Math.round(s.available * 10) / 10).toLocaleString("pt-BR")} g{s.low ? " · estoque baixo" : ""}</p>;
                  })()}
                </Link>
                <DeleteButton what={f.name} action={deleteFilament.bind(null, f.id)} />
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
