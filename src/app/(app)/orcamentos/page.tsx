import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { QUOTE_COLUMNS, type QuoteRow } from "@/features/quotes/schema";
import { StatusBadge } from "@/features/quotes/status-badge";
import { effectiveStatus, formatDateBR, formatQuoteNumber, QUOTE_STATUSES, STATUS_LABEL, todayBR, type QuoteStatus } from "@/features/quotes/status";
import { PlanNotice } from "@/components/plan-notice";
import { loadEntitlements } from "@/features/billing/server";
import { createClient } from "@/lib/supabase/server";
import { cn, formatBRL } from "@/lib/utils";

export const metadata = { title: "Orçamentos" };

export default async function QuotesPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const sp = await searchParams;
  const filter = QUOTE_STATUSES.find((s) => s === sp.status) ?? null;
  const q = (sp.q ?? "").trim().toLowerCase();
  const supabase = await createClient();
  const entitlement = await loadEntitlements(supabase);
  const { data } = await supabase.from("quotes").select(QUOTE_COLUMNS).order("number", { ascending: false });
  const today = todayBR();
  const all = ((data ?? []) as QuoteRow[]).map((r) => ({ ...r, shown: effectiveStatus(r.status, r.valid_until, today) as QuoteStatus }));
  const counts = new Map<QuoteStatus, number>();
  for (const r of all) counts.set(r.shown, (counts.get(r.shown) ?? 0) + 1);
  const rows = all.filter((r) => (!filter || r.shown === filter) && (!q || `${r.customer_name} ${r.number}`.toLowerCase().includes(q)));
  const href = (s: string | null) => `/orcamentos${s || q ? `?${new URLSearchParams({ ...(s ? { status: s } : {}), ...(q ? { q } : {}) })}` : ""}`;

  return (
    <>
      <PlanNotice entitlement={entitlement} feature="quotes" />
      <PageHeader
        title="Orçamentos"
        description="Histórico dos orçamentos que você criou, com o status de cada um."
        action={<Button asChild><Link href="/orcamentos/novo"><Plus size={18} />Novo orçamento</Link></Button>}
      />
      <form className="mb-4 flex gap-3" role="search" aria-label="Buscar orçamentos">
        {filter && <input type="hidden" name="status" value={filter} />}
        <Input name="q" type="search" defaultValue={sp.q ?? ""} placeholder="Buscar por cliente ou número…" aria-label="Buscar" />
        <Button type="submit" variant="secondary">Buscar</Button>
      </form>
      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Filtro por status">
        <Link href={href(null)} aria-current={!filter ? "page" : undefined} className={cn("flex h-9 items-center rounded-full border px-4 text-sm", !filter ? "border-accent bg-accent-soft font-medium text-accent-strong" : "border-line text-muted hover:text-ink")}>
          Todos ({all.length})
        </Link>
        {QUOTE_STATUSES.map((s) => (
          <Link key={s} href={href(s)} aria-current={filter === s ? "page" : undefined} className={cn("flex h-9 items-center rounded-full border px-4 text-sm", filter === s ? "border-accent bg-accent-soft font-medium text-accent-strong" : "border-line text-muted hover:text-ink")}>
            {STATUS_LABEL[s]} ({counts.get(s) ?? 0})
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <Card className="text-center text-muted">
          {all.length === 0 ? (
            <>Nenhum orçamento ainda. <Link href="/orcamentos/novo" className="font-medium text-accent-strong underline">Crie o primeiro</Link> a partir dos seus produtos.</>
          ) : (
            "Nenhum orçamento neste filtro."
          )}
        </Card>
      ) : (
        <ul className="space-y-3" data-testid="lista-orcamentos">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/orcamentos/${r.id}`} className="block">
                <Card className="flex items-center gap-3 p-4 hover:border-accent">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2">
                      <span className="num text-sm text-muted">{formatQuoteNumber(r.number)}</span>
                      <span className="truncate font-medium">{r.customer_name}</span>
                    </p>
                    <p className="text-xs text-muted">Emitido em {formatDateBR(r.issue_date)} · válido até {formatDateBR(r.valid_until)}</p>
                  </div>
                  <div className="space-y-1 text-right">
                    <p className="num font-semibold">{formatBRL(r.total)}</p>
                    <StatusBadge status={r.shown} />
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
