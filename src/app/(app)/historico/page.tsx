import { SettingsTabs } from "@/components/settings-tabs";
import { PageHeader, Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { formatBRL, formatDateTime } from "@/lib/utils";

export const metadata = { title: "Histórico" };

const ENTITY: Record<string, string> = {
  printers: "Impressora",
  filaments: "Filamento",
  products: "Produto",
  pricings: "Precificação",
  imported_models: "Modelo importado",
};
const ACTION: Record<string, string> = { insert: "criada", update: "alterada", delete: "excluída" };

type Entry = { id: number; action: string; entity: string; changes: Record<string, unknown> | null; created_at: string };

function describe(e: Entry): string {
  const c = e.changes ?? {};
  const row = (e.action === "update" ? (c.new as Record<string, unknown> | undefined) : c) ?? {};
  if (e.entity === "pricings") {
    const price = Number(row.unit_price);
    return Number.isFinite(price) ? `de ${formatBRL(price)}/unid.` : "";
  }
  const label = typeof row.name === "string" ? row.name : typeof row.title === "string" ? row.title : null;
  return label ? `“${label}”` : "";
}

export default async function HistoryPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("audit_log")
    .select("id, action, entity, changes, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  const entries = (data ?? []) as Entry[];

  return (
    <>
      <PageHeader title="Histórico" description="Últimas 100 operações na sua conta." />
      <SettingsTabs current="/historico" />
      {entries.length === 0 ? (
        <Card className="text-center text-muted">Nada por aqui ainda.</Card>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-line">
            {entries.map((e) => (
              <li key={e.id} className="flex items-baseline justify-between gap-3 px-4 py-3 text-sm">
                <span className="min-w-0">
                  <span className="font-medium">{ENTITY[e.entity] ?? e.entity}</span>{" "}
                  {ACTION[e.action] ?? e.action} <span className="text-muted">{describe(e)}</span>
                </span>
                <time className="num shrink-0 text-xs text-muted">{formatDateTime(e.created_at)}</time>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
