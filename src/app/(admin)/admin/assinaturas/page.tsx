import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { requireAdminPage } from "@/features/admin/guard";
import { parsePage } from "@/features/admin/schema";
import { loadSubscriptions } from "@/features/admin/server";
import { Badge, brl, fmtDate, fmtDay, Pager, stateLabel, stateTone, Table } from "@/features/admin/ui";
import { STATE_LABEL } from "@/lib/billing/state";

export const metadata = { title: "Assinaturas · Administração" };

export default async function SubscriptionsPage({ searchParams }: { searchParams: Promise<{ q?: string; estado?: string; pagina?: string }> }) {
  const { supabase } = await requireAdminPage();
  const sp = await searchParams;
  const { page, limit, offset } = parsePage(sp.pagina);
  const q = sp.q?.slice(0, 80);
  const rows = await loadSubscriptions(supabase, { q, state: sp.estado, limit, offset });
  const total = rows[0]?.total ?? 0;
  return (
    <>
      <PageHeader title="Assinaturas" description="Uma linha por cliente (a assinatura vigente ou a mais recente). Alterações são feitas na página do cliente." />
      <form className="mb-4 grid gap-3 sm:grid-cols-3" role="search">
        <Field label="Buscar (nome ou e-mail)"><Input name="q" defaultValue={q} /></Field>
        <Field label="Situação"><Select name="estado" defaultValue={sp.estado ?? ""}><option value="">Todas</option>{Object.entries(STATE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <div className="flex items-end"><Button variant="secondary" className="w-full">Filtrar</Button></div>
      </form>
      <Table head={["Cliente", "Plano", "Situação", "Contratada em", "Próxima cobrança", "Último pagamento", "Cancelamento", "Gateway"]} empty={rows.length === 0 ? "Nenhuma assinatura encontrada." : undefined}>
        {rows.map((r) => (
          <tr key={r.user_id} data-testid="linha-assinatura">
            <td className="px-4 py-3"><Link href={`/admin/usuarios/${r.user_id}`} className="font-medium text-accent-strong hover:underline">{r.full_name || r.email}</Link><div className="text-xs text-muted">{r.email}</div></td>
            <td className="px-4 py-3">{r.plan_code === "trial" ? "Teste grátis" : r.plan_code}</td>
            <td className="px-4 py-3"><Badge tone={stateTone(r.state)}>{stateLabel(r.state)}</Badge></td>
            <td className="px-4 py-3">{fmtDay(r.contracted_at)}</td>
            <td className="px-4 py-3">{fmtDay(r.next_charge)}</td>
            <td className="px-4 py-3">{r.last_paid_at ? `${brl(r.last_paid_cents)} em ${fmtDay(r.last_paid_at)}` : "—"}</td>
            <td className="px-4 py-3">{r.canceled_at ? fmtDate(r.canceled_at) : r.cancel_at_period_end ? "Agendado" : "—"}</td>
            <td className="px-4 py-3 text-xs">{r.gateway ? <>{r.gateway}<div className="num text-muted">{r.gateway_subscription_id}</div></> : "—"}</td>
          </tr>
        ))}
      </Table>
      <Pager base="/admin/assinaturas" params={{ q, estado: sp.estado }} page={page} total={total} size={limit} />
    </>
  );
}
