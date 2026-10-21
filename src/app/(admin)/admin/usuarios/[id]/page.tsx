import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PageHeader } from "@/components/ui/card";
import { CancelForm, CourtesyForm, EndCourtesyForm } from "@/features/admin/forms";
import { requireAdminPage } from "@/features/admin/guard";
import { loadPlans, loadUserDetail } from "@/features/admin/server";
import { Badge, brl, fmtBytes, fmtDate, stateLabel, stateTone, Table } from "@/features/admin/ui";
import { LIMIT_LABEL } from "@/lib/billing/state";

export const metadata = { title: "Cliente · Administração" };

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { supabase } = await requireAdminPage();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  let d;
  try { d = await loadUserDetail(supabase, id); } catch { notFound(); }
  const plans = (await loadPlans(supabase)).filter((p) => p.is_active && p.code !== "gratuito");
  const paid = d.assinatura?.gateway_assinatura != null && ["active", "past_due"].includes(d.assinatura.status);
  const trial = d.assinatura?.status === "trialing" && !d.assinatura.gateway_assinatura;
  const usage: [string, number, number | null | undefined][] = [
    ["max_products", d.uso.produtos, d.plano.limites.max_products], ["max_printers", d.uso.impressoras, d.plano.limites.max_printers],
    ["max_filaments", d.uso.filamentos, d.plano.limites.max_filaments], ["max_storage_mb", Math.round(d.uso.armazenamento_bytes / 1048576), d.plano.limites.max_storage_mb],
  ];
  return (
    <>
      <PageHeader title={d.perfil.nome || d.perfil.email} description={d.perfil.email} action={<Link href="/admin/usuarios" className="text-sm text-accent-strong hover:underline">← Usuários</Link>} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-2" data-testid="detalhe-plano">
          <h2 className="font-semibold">Plano e situação</h2>
          <p><Badge tone={stateTone(d.plano.estado)}>{stateLabel(d.plano.estado)}</Badge> <span className="ml-1">{d.plano.codigo === "trial" ? "Teste grátis" : d.plano.codigo}</span></p>
          <dl className="grid grid-cols-2 gap-1 text-sm">
            <dt className="text-muted">Cadastro</dt><dd>{fmtDate(d.perfil.cadastro)}</dd>
            <dt className="text-muted">Último acesso</dt><dd>{fmtDate(d.perfil.ultimo_acesso)}</dd>
            <dt className="text-muted">Próxima cobrança / fim</dt><dd>{fmtDate(d.plano.fim_periodo)}</dd>
            <dt className="text-muted">Gateway</dt><dd>{d.assinatura?.gateway ?? "—"} {d.assinatura?.gateway_assinatura ? <span className="num text-xs text-muted">{d.assinatura.gateway_assinatura}</span> : null}</dd>
          </dl>
        </Card>
        <Card className="space-y-2" data-testid="detalhe-uso">
          <h2 className="font-semibold">Uso dos limites</h2>
          <ul className="space-y-1 text-sm">
            {usage.map(([k, used, max]) => <li key={k} className="flex justify-between"><span>{LIMIT_LABEL[k] ?? k}</span><span className="num">{used} / {max === null || max === undefined ? "∞" : max}</span></li>)}
          </ul>
          <p className="text-xs text-muted">Também: {d.uso.modelos_importados} modelos importados · {d.uso.precificacoes} precificações · {d.uso.orcamentos} orçamentos · {d.uso.pedidos} pedidos · {fmtBytes(d.uso.armazenamento_bytes)} em arquivos. Só contagens: o conteúdo é privado do cliente.</p>
        </Card>
      </div>

      <h2 className="mb-2 mt-8 font-semibold">Cobranças</h2>
      <Table head={["Status", "Valor", "Meio", "Vencimento", "Pago em"]} empty={d.cobrancas.length === 0 ? "Nenhuma cobrança." : undefined}>
        {d.cobrancas.map((c, i) => <tr key={i}><td className="px-4 py-3">{c.status}</td><td className="num px-4 py-3">{brl(c.amount_cents)}</td><td className="px-4 py-3">{c.method ?? "—"}</td><td className="px-4 py-3">{c.due_date ?? "—"}</td><td className="px-4 py-3">{fmtDate(c.paid_at)}</td></tr>)}
      </Table>
      <h2 className="mb-2 mt-8 font-semibold">Histórico da assinatura</h2>
      <Table head={["Quando", "De", "Para", "Motivo"]} empty={d.mudancas.length === 0 ? "Sem alterações." : undefined}>
        {d.mudancas.map((m, i) => <tr key={i}><td className="px-4 py-3">{fmtDate(m.created_at)}</td><td className="px-4 py-3">{m.from_plan ?? "—"} {m.from_status ? `(${m.from_status})` : ""}</td><td className="px-4 py-3">{m.to_plan} ({m.to_status})</td><td className="px-4 py-3">{m.reason}</td></tr>)}
      </Table>
      <h2 className="mb-2 mt-8 font-semibold">Eventos do gateway</h2>
      <Table head={["Quando", "Tipo", "Resultado", "Erro"]} empty={d.eventos.length === 0 ? "Sem eventos." : undefined}>
        {d.eventos.map((e, i) => <tr key={i}><td className="px-4 py-3">{fmtDate(e.occurred_at)}</td><td className="px-4 py-3">{e.gateway} · {e.event_type}</td><td className="px-4 py-3">{e.status}</td><td className="px-4 py-3">{e.error ?? "—"}</td></tr>)}
      </Table>

      <h2 className="mb-2 mt-8 text-lg font-semibold">Ações administrativas</h2>
      <p className="mb-3 text-sm text-muted">Todas ficam registradas na auditoria. Pagamentos não podem ser marcados manualmente: só o gateway confirma.</p>
      <div className="grid gap-4 lg:grid-cols-2">
        {!paid && <Card><CourtesyForm userId={id} plans={plans.map((p) => ({ code: p.code, name: p.name }))} /></Card>}
        {trial && <Card><EndCourtesyForm userId={id} /></Card>}
        {paid && !d.assinatura?.cancela_no_fim && <Card><CancelForm userId={id} /></Card>}
        {paid && d.assinatura?.cancela_no_fim && <Card><p className="text-sm">Cancelamento já agendado para o fim do período pago.</p></Card>}
      </div>
    </>
  );
}
