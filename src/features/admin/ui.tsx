import Link from "next/link";
import { Card } from "@/components/ui/card";
import { cn, formatBRL } from "@/lib/utils";
import { STATE_LABEL, type SubscriptionState } from "@/lib/billing/state";

export const brl = (cents: number | null | undefined) => (cents === null || cents === undefined ? "—" : formatBRL(cents / 100));
export const fmtDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }) : "—");
export const fmtDay = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");
export const fmtBytes = (n: number) => (n >= 1_073_741_824 ? `${(n / 1_073_741_824).toFixed(2)} GB` : n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);
export const stateLabel = (s: string) => STATE_LABEL[s as SubscriptionState] ?? s;

export function Stat({ label, value, hint, testId }: { label: string; value: React.ReactNode; hint?: string; testId?: string }) {
  return (
    <Card className="space-y-1" data-testid={testId}>
      <p className="text-sm text-muted">{label}</p>
      <p className="num text-2xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </Card>
  );
}

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "ok" | "warn" | "danger" }) {
  return <span className={cn("inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium", tone === "ok" && "border-ok/30 bg-ok/10 text-ok", tone === "warn" && "border-warn/40 bg-accent-soft text-warn", tone === "danger" && "border-danger/30 bg-danger/10 text-danger", tone === "neutral" && "border-line bg-paper text-muted")}>{children}</span>;
}
export const stateTone = (s: string): "ok" | "warn" | "danger" | "neutral" =>
  s === "ativo" ? "ok" : ["pagamento_pendente", "cancelamento_agendado", "em_teste"].includes(s) ? "warn" : ["inadimplente", "cancelado"].includes(s) ? "danger" : "neutral";

/** Tabela rolável no celular. */
export function Table({ head, children, empty }: { head: string[]; children: React.ReactNode; empty?: string }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-line bg-paper text-xs uppercase tracking-wide text-muted"><tr>{head.map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
      {empty && <p className="px-4 py-6 text-center text-sm text-muted">{empty}</p>}
    </div>
  );
}

export function Pager({ base, params, page, total, size }: { base: string; params: Record<string, string | undefined>; page: number; total: number; size: number }) {
  const pages = Math.max(1, Math.ceil(total / size));
  const href = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    if (p > 1) q.set("pagina", String(p));
    const s = q.toString();
    return s ? `${base}?${s}` : base;
  };
  return (
    <nav aria-label="Paginação" className="mt-4 flex items-center justify-between text-sm">
      <span className="text-muted">{total} resultado{total === 1 ? "" : "s"} · página {page} de {pages}</span>
      <span className="flex gap-2">
        {page > 1 && <Link href={href(page - 1)} className="flex h-9 items-center rounded-xl border border-line px-3 hover:bg-paper">Anterior</Link>}
        {page < pages && <Link href={href(page + 1)} className="flex h-9 items-center rounded-xl border border-line px-3 hover:bg-paper">Próxima</Link>}
      </span>
    </nav>
  );
}
