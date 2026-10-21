import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Card, PageHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import type { FilamentRow } from "@/features/filaments/schema";
import { MinStockEditor, SpoolForm } from "@/features/stock/stock-forms";
import { SPOOL_COLUMNS, SPOOL_STATUS_LABEL, type SpoolRow } from "@/features/stock/schema";
import { isOverCommitted, isSpoolLow, stockByFilament } from "@/features/stock/summary";
import { formatDateBR } from "@/features/quotes/status";
import { createClient } from "@/lib/supabase/server";
import { cn, formatBRL } from "@/lib/utils";

export const metadata = { title: "Estoque" };

const g = (n: number) => `${(Math.round(n * 10) / 10).toLocaleString("pt-BR")} g`;

export default async function StockPage({ searchParams }: { searchParams: Promise<{ filamento?: string; status?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const [spoolsRes, filRes] = await Promise.all([
    supabase.from("filament_spools").select(SPOOL_COLUMNS).order("created_at", { ascending: false }),
    supabase.from("filaments").select("*").eq("is_active", true).order("name"),
  ]);
  const spools = (spoolsRes.data ?? []) as SpoolRow[];
  const filaments = (filRes.data ?? []) as FilamentRow[];
  const summary = stockByFilament(filaments.map((f) => ({ id: f.id, name: f.name, material: f.material, color: f.color, min_stock_g: f.min_stock_g ?? 250 })), spools);
  // Só alerta de filamentos cujo estoque o usuário realmente controla (tem bobinas em uso ou novas).
  const lows = summary.filter((s) => s.spools > 0 && s.low);
  const over = spools.filter(isOverCommitted);
  const nameOf = new Map(filaments.map((f) => [f.id, f.name]));
  const shown = spools.filter((s) => (!sp.filamento || s.filament_id === sp.filamento) && (!sp.status || s.status === sp.status));

  return (
    <>
      <PageHeader title="Estoque de filamento" description="Bobinas, saldo e material reservado para os pedidos. Orçamento não baixa estoque: só a produção." />

      {(lows.length > 0 || over.length > 0) && (
        <div className="mb-4 space-y-2" data-testid="alertas-estoque">
          {lows.map((l) => (
            <p key={l.filament.id} role="alert" className="flex flex-wrap items-center gap-2 rounded-xl bg-accent-soft px-3 py-2 text-sm text-warn">
              <AlertTriangle size={16} aria-hidden="true" />
              <strong>{l.filament.name}</strong>: estoque baixo — {g(Math.max(0, l.available))} disponíveis (mínimo {g(l.filament.min_stock_g)}).
            </p>
          ))}
          {over.map((s) => (
            <p key={s.id} role="alert" className="flex items-center gap-2 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
              <AlertTriangle size={16} aria-hidden="true" />
              Bobina {s.manufacturer ?? s.material} {s.color ?? ""}: {g(s.reserved_g)} reservados e só {g(s.remaining_g)} no saldo. Cadastre outra bobina ou ajuste os lotes.
            </p>
          ))}
        </div>
      )}

      <div className="mb-6"><SpoolForm filaments={filaments.map((f) => ({ id: f.id, name: f.name, material: f.material, color: f.color }))} /></div>

      <section aria-labelledby="h-fil" className="mb-8">
        <h2 id="h-fil" className="mb-3 text-lg font-semibold">Por filamento</h2>
        {filaments.length === 0 ? (
          <Card className="text-sm text-muted">Cadastre um <Link href="/filamentos/novo" className="font-medium text-accent-strong underline">filamento</Link> para controlar o estoque dele.</Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2" data-testid="estoque-por-filamento">
            {summary.map((s) => (
              <Card key={s.filament.id} className={cn("space-y-3", s.low && s.spools > 0 && "border-warn/40")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><p className="truncate font-medium">{s.filament.name}</p><p className="text-xs text-muted">{s.spools} bobina{s.spools === 1 ? "" : "s"} em uso ou nova{s.spools === 1 ? "" : "s"}</p></div>
                  {s.spools === 0 ? <span className="rounded-full bg-paper px-2 py-0.5 text-xs text-muted">sem bobinas</span> : s.low ? <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs text-warn">Estoque baixo</span> : <span className="rounded-full bg-ok/10 px-2 py-0.5 text-xs text-ok">Ok</span>}
                </div>
                <dl className="grid grid-cols-3 gap-2 text-sm">
                  <div><dt className="text-xs text-muted">No saldo</dt><dd className="num font-medium">{g(s.remaining)}</dd></div>
                  <div><dt className="text-xs text-muted">Reservado</dt><dd className="num font-medium">{g(s.reserved)}</dd></div>
                  <div><dt className="text-xs text-muted">Disponível</dt><dd className={cn("num font-semibold", s.available < 0 && "text-danger")}>{g(s.available)}</dd></div>
                </dl>
                <MinStockEditor filamentId={s.filament.id} value={s.filament.min_stock_g} />
              </Card>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="h-bob" className="mb-8">
        <h2 id="h-bob" className="mb-3 text-lg font-semibold">Bobinas</h2>
        <form className="mb-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto]" role="search" aria-label="Filtrar bobinas">
          <Select name="filamento" defaultValue={sp.filamento ?? ""} aria-label="Filamento"><option value="">Todos os filamentos</option>{filaments.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select>
          <Select name="status" defaultValue={sp.status ?? ""} aria-label="Status"><option value="">Todos os status</option>{(Object.keys(SPOOL_STATUS_LABEL) as SpoolRow["status"][]).map((s) => <option key={s} value={s}>{SPOOL_STATUS_LABEL[s]}</option>)}</Select>
          <Button type="submit" variant="secondary">Filtrar</Button>
        </form>
        {shown.length === 0 ? (
          <Card className="text-center text-sm text-muted">Nenhuma bobina {spools.length === 0 ? "cadastrada ainda. Use “Nova bobina” acima." : "neste filtro."}</Card>
        ) : (
          <ul className="space-y-3" data-testid="lista-bobinas">
            {shown.map((s) => (
              <li key={s.id}>
                <Link href={`/estoque/${s.id}`} className="block">
                  <Card className="flex items-center gap-3 p-4 hover:border-accent">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{s.filament_id ? nameOf.get(s.filament_id) ?? s.material : s.material}{s.manufacturer ? ` · ${s.manufacturer}` : ""}</p>
                      <p className="text-xs text-muted">{[s.color, s.location, s.purchased_at ? `compra em ${formatDateBR(s.purchased_at)}` : null, `pago ${formatBRL(s.price_paid)}`].filter(Boolean).join(" · ")}</p>
                    </div>
                    <div className="text-right">
                      <p className="num font-semibold">{g(s.remaining_g)}</p>
                      <p className="text-xs text-muted">de {g(s.initial_g)}{s.reserved_g > 0 ? ` · ${g(s.reserved_g)} reservados` : ""}</p>
                      <div className="mt-1 flex justify-end gap-1">
                        <span className="rounded-full bg-paper px-2 py-0.5 text-xs text-muted">{SPOOL_STATUS_LABEL[s.status]}</span>
                        {isSpoolLow(s) && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs text-warn">Acabando</span>}
                      </div>
                    </div>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
