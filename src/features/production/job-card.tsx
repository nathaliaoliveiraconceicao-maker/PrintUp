"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, Check, Package, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { uuid4 } from "@/features/imports/paths";
import { JobStageBadge, OverdueBadge } from "@/features/orders/badges";
import type { JobRow } from "@/features/orders/schema";
import { followingStage, previousStage } from "@/features/orders/status";
import { formatDateBR, formatQuoteNumber } from "@/features/quotes/status";
import { parseDecimal } from "@/lib/utils";
import { cancelJob, completeJob, reportFailure, reserveJob, setJobStage } from "./actions";
import type { JobActionState } from "./schema";

const dec = (n: number | null) => (n === null ? "" : String(Math.round(n * 100) / 100).replace(".", ","));
const fmtMin = (m: number | null) => (m === null ? "—" : `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, "0")} min`);
const fmtG = (g: number | null) => (g === null ? "—" : `${String(Math.round(g * 10) / 10).replace(".", ",")} g`);
const num = (s: string) => {
  const n = parseDecimal(s);
  return Number.isNaN(n) ? (s.trim() === "" ? null : NaN) : n;
};

export interface JobCardOrder { id: string; number: number; customer: string; due: string | null }

export function JobCard({ job, order, reservedG, overdue, showOrder = true }: { job: JobRow; order: JobCardOrder; reservedG: number; overdue: boolean; showOrder?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<JobActionState>({});
  const [panel, setPanel] = useState<"concluir" | "falha" | null>(null);
  const [grams, setGrams] = useState(dec(job.est_grams));
  const [minutes, setMinutes] = useState(dec(job.est_minutes));
  const [fGrams, setFGrams] = useState("");
  const [fMinutes, setFMinutes] = useState("");
  const [note, setNote] = useState("");
  const [key, setKey] = useState(() => uuid4());
  const active = job.stage !== "concluido" && job.stage !== "cancelado";
  const prev = previousStage(job.stage);
  const next = followingStage(job.stage);
  const noReservation = active && (job.est_grams ?? 0) > 0 && job.filament_id !== null && reservedG < (job.est_grams ?? 0) - 0.01;

  const run = (fn: () => Promise<JobActionState>, then?: () => void) =>
    start(async () => {
      const r = await fn();
      setMsg(r);
      if (r.ok) {
        then?.();
        router.refresh();
      }
    });

  return (
    <article className="space-y-3 rounded-2xl border border-line bg-surface p-3.5" data-testid="tarefa" aria-label={`${job.product_name}, ${job.quantity} unidade(s)`}>
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{job.product_name}</p>
          {showOrder && (
            <Link href={`/pedidos/${order.id}`} className="block truncate text-xs text-muted underline-offset-2 hover:underline">
              Pedido {formatQuoteNumber(order.number)} · {order.customer}
            </Link>
          )}
        </div>
        <span className="num shrink-0 rounded-lg bg-paper px-2 py-1 text-sm font-semibold">{job.quantity}×</span>
      </header>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <div><dt className="text-muted">Impressora</dt><dd className="truncate">{job.printer_name ?? "Não definida"}</dd></div>
        <div><dt className="text-muted">Filamento</dt><dd className="truncate">{job.filament_name ?? "Não definido"}</dd></div>
        <div><dt className="text-muted">Material (est.)</dt><dd className="num">{fmtG(job.est_grams)}</dd></div>
        <div><dt className="text-muted">Tempo (est.)</dt><dd className="num">{fmtMin(job.est_minutes)}</dd></div>
        <div><dt className="text-muted">Prazo</dt><dd>{order.due ? formatDateBR(order.due) : "Sem prazo"}</dd></div>
        {job.stage === "concluido" && <div><dt className="text-muted">Consumo real</dt><dd className="num">{fmtG(job.actual_grams)}</dd></div>}
      </dl>

      <div className="flex flex-wrap items-center gap-1.5">
        <JobStageBadge stage={job.stage} />
        {overdue && <OverdueBadge />}
        {active && reservedG > 0 && <span className="rounded-full bg-ok/10 px-2 py-0.5 text-xs text-ok">Reservado {fmtG(reservedG)}</span>}
        {noReservation && <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-xs text-warn"><TriangleAlert size={12} aria-hidden="true" />Sem material reservado</span>}
        {job.failed_count > 0 && <span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs text-danger">{job.failed_count} falha{job.failed_count > 1 ? "s" : ""} · {fmtG(job.failed_grams)}</span>}
      </div>

      {active && (
        <div className="flex flex-wrap gap-2">
          {prev && <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => setJobStage(job.id, prev))} aria-label={`Voltar para ${prev}`}><ArrowLeft size={14} />Voltar</Button>}
          {next && <Button size="sm" disabled={pending} onClick={() => run(() => setJobStage(job.id, next))} aria-label={`Avançar para ${next}`}>Avançar<ArrowRight size={14} /></Button>}
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => { setPanel(panel === "concluir" ? null : "concluir"); setMsg({}); }}><Check size={14} />Concluir</Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => { setPanel(panel === "falha" ? null : "falha"); setMsg({}); setKey(uuid4()); }}><TriangleAlert size={14} />Falha</Button>
          {noReservation && <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => reserveJob(job.id))}><Package size={14} />Reservar material</Button>}
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => { if (confirm("Cancelar esta tarefa? O material reservado será liberado.")) run(() => cancelJob(job.id)); }} aria-label="Cancelar tarefa"><X size={14} /></Button>
        </div>
      )}

      {panel === "concluir" && active && (
        <div className="space-y-3 rounded-xl border border-line bg-paper p-3" data-testid="painel-concluir">
          <p className="text-xs text-muted">Informe o que foi gasto de verdade (inclui suportes, purga e desperdício). O estoque baixa o valor real, não o estimado.</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Consumo real (g)"><Input inputMode="decimal" value={grams} onChange={(e) => setGrams(e.target.value)} /></Field>
            <Field label="Tempo real (min)"><Input inputMode="decimal" value={minutes} onChange={(e) => setMinutes(e.target.value)} /></Field>
          </div>
          <Button size="sm" disabled={pending} onClick={() => run(() => completeJob({ jobId: job.id, actualGrams: num(grams), actualMinutes: num(minutes) }), () => setPanel(null))}>{pending ? "Salvando…" : "Concluir e baixar estoque"}</Button>
        </div>
      )}
      {panel === "falha" && active && (
        <div className="space-y-3 rounded-xl border border-danger/30 bg-danger/5 p-3" data-testid="painel-falha">
          <p className="text-xs text-muted">O material perdido sai do estoque agora. A tarefa continua aberta para a reimpressão.</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Material perdido (g)"><Input inputMode="decimal" value={fGrams} onChange={(e) => setFGrams(e.target.value)} placeholder="0" /></Field>
            <Field label="Tempo perdido (min)"><Input inputMode="decimal" value={fMinutes} onChange={(e) => setFMinutes(e.target.value)} placeholder="0" /></Field>
          </div>
          <Field label="O que aconteceu (opcional)"><Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} /></Field>
          <Button size="sm" variant="danger" disabled={pending} onClick={() => run(() => reportFailure({ jobId: job.id, gramsLost: num(fGrams) ?? 0, minutesLost: num(fMinutes), note, key }), () => { setPanel(null); setFGrams(""); setFMinutes(""); setNote(""); })}>{pending ? "Registrando…" : "Registrar falha"}</Button>
        </div>
      )}
      {msg.error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{msg.error}</p>}
      {msg.ok && msg.message && <p role="status" className="rounded-lg bg-ok/10 px-3 py-2 text-xs text-ok">{msg.message}</p>}
    </article>
  );
}
