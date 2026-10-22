import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card, PageHeader } from "@/components/ui/card";
import { AdjustForm, SpoolMetaForm } from "@/features/stock/stock-forms";
import { MOVEMENT_KIND_LABEL, MOVEMENT_COLUMNS, SPOOL_COLUMNS, type MovementRow, type SpoolRow } from "@/features/stock/schema";
import { createClient } from "@/lib/supabase/server";
import { formatBRL, formatDateTime } from "@/lib/utils";

export const metadata = { title: "Bobina" };

const g = (n: number) => `${(Math.round(n * 10) / 10).toLocaleString("pt-BR")} g`;
const signed = (n: number) => (n === 0 ? "—" : `${n > 0 ? "+" : "−"}${g(Math.abs(n))}`);

export default async function SpoolPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("filament_spools").select(SPOOL_COLUMNS).eq("id", id).maybeSingle();
  if (!data) notFound();
  const s = data as SpoolRow;
  const { data: mv } = await supabase.from("stock_movements").select(MOVEMENT_COLUMNS).eq("spool_id", id).order("created_at", { ascending: false }).limit(200);
  const movements = (mv ?? []) as MovementRow[];

  return (
    <>
      <Link href="/filamentos/estoque" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft size={14} /> Estoque de bobinas</Link>
      <PageHeader title={`${s.manufacturer ?? s.material}${s.color ? ` · ${s.color}` : ""}`} description={`${s.material} · pago ${formatBRL(s.price_paid)} (${formatBRL(s.initial_g > 0 ? (s.price_paid / s.initial_g) * 1000 : 0)}/kg)`} />
      <Card className="mb-6">
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div><dt className="text-xs text-muted">Peso inicial</dt><dd className="num font-medium">{g(s.initial_g)}</dd></div>
          <div><dt className="text-xs text-muted">No saldo</dt><dd className="num font-semibold">{g(s.remaining_g)}</dd></div>
          <div><dt className="text-xs text-muted">Reservado</dt><dd className="num font-medium">{g(s.reserved_g)}</dd></div>
          <div><dt className="text-xs text-muted">Disponível</dt><dd className="num font-medium">{g(s.remaining_g - s.reserved_g)}</dd></div>
        </dl>
      </Card>
      <section className="mb-6 space-y-3"><h2 className="text-lg font-semibold">Dados da bobina</h2><Card><SpoolMetaForm spool={s} /></Card></section>
      <section className="mb-6 space-y-3"><h2 className="text-lg font-semibold">Ajustar saldo</h2><Card><AdjustForm spoolId={s.id} remaining={s.remaining_g} /></Card></section>
      <section className="mb-6 space-y-3" data-testid="historico-bobina">
        <h2 className="text-lg font-semibold">Histórico de movimentações</h2>
        <Card className="p-0">
          <ul className="divide-y divide-line text-sm">
            {movements.map((m) => (
              <li key={m.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium">{MOVEMENT_KIND_LABEL[m.kind]}</p>
                  <p className="text-xs text-muted">{formatDateTime(m.created_at)}{m.note ? ` · ${m.note}` : ""}{m.job_id ? " · ligado a uma tarefa" : ""}</p>
                </div>
                <div className="text-right"><p className="num font-medium">{m.delta_remaining !== 0 ? signed(m.delta_remaining) : `reserva ${signed(m.delta_reserved)}`}</p><p className="num text-xs text-muted">saldo {g(m.balance_remaining)}</p></div>
              </li>
            ))}
          </ul>
        </Card>
      </section>
    </>
  );
}
