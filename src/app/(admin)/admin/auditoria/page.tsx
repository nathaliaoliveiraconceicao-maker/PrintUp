import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/field";
import { requireAdminPage } from "@/features/admin/guard";
import { parsePage } from "@/features/admin/schema";
import { loadAudit } from "@/features/admin/server";
import { fmtDate, Pager, Table } from "@/features/admin/ui";

export const metadata = { title: "Auditoria · Administração" };
const ACTIONS = ["papel.alterado", "plano.alterado", "assinatura.cortesia", "assinatura.cortesia_encerrada", "assinatura.cancelamento_agendado", "cupom.criado", "cupom.ativado", "cupom.desativado", "configuracao.alterada", "usuario.consulta"];

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ acao?: string; pagina?: string }> }) {
  const { supabase } = await requireAdminPage();
  const sp = await searchParams;
  const { page, limit, offset } = parsePage(sp.pagina, 50);
  const action = ACTIONS.includes(sp.acao ?? "") ? sp.acao : undefined;
  const rows = await loadAudit(supabase, { action, limit, offset });
  return (
    <>
      <PageHeader title="Auditoria" description="Registro imutável das ações administrativas (ninguém edita nem apaga)." />
      <form className="mb-4 flex flex-wrap items-end gap-3" role="search">
        <Field label="Ação"><Select name="acao" defaultValue={action ?? ""}><option value="">Todas</option>{ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}</Select></Field>
        <Button variant="secondary">Filtrar</Button>
      </form>
      <Table head={["Quando", "Quem", "Ação", "Alvo", "Detalhes"]} empty={rows.length === 0 ? "Nenhum registro." : undefined}>
        {rows.map((r) => (
          <tr key={r.id} data-testid="linha-auditoria">
            <td className="px-4 py-3">{fmtDate(r.created_at)}</td>
            <td className="px-4 py-3">{r.actor_email ?? (r.actor_kind === "sistema" ? "Procedimento do sistema" : "—")}</td>
            <td className="px-4 py-3 font-medium">{r.action}</td>
            <td className="px-4 py-3 text-xs">{r.entity}<div className="num text-muted">{r.entity_id}</div></td>
            <td className="max-w-xs px-4 py-3 text-xs text-muted"><code className="break-words">{JSON.stringify(r.details).slice(0, 300)}</code></td>
          </tr>
        ))}
      </Table>
      <Pager base="/admin/auditoria" params={{ acao: action }} page={page} total={rows[0]?.total ?? 0} size={limit} />
    </>
  );
}
