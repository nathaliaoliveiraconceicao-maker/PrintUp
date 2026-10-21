import { PageHeader } from "@/components/ui/card";
import { requireAdminPage } from "@/features/admin/guard";
import { loadMonitoring } from "@/features/admin/server";
import { Badge, brl, fmtBytes, fmtDate, Stat, Table } from "@/features/admin/ui";

export const metadata = { title: "Monitoramento · Administração" };
const KIND = { importacao: "Importação de modelos", pdf: "Geração de PDF", pagamento: "Pagamento", webhook: "Webhook", seguranca: "Segurança", sistema: "Sistema" } as const;

export default async function MonitoringPage() {
  const { supabase } = await requireAdminPage();
  const m = await loadMonitoring(supabase);
  const count = (kind: string) => Object.entries(m.eventos_por_tipo_7d).filter(([k]) => k.startsWith(`${kind}/`) && !k.endsWith("/info")).reduce((s, [, n]) => s + n, 0);
  return (
    <>
      <PageHeader title="Monitoramento" description="Eventos dos últimos dias. Mensagens e metadados não contêm segredos nem dados pessoais." />
      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="monitoramento-resumo">
        <Stat label="Webhooks com erro (7 dias)" value={m.webhooks_erro_7d} />
        <Stat label="Pagamentos falhos (30 dias)" value={m.pagamentos_falhos_30d} />
        <Stat label="Clientes perto do limite de armazenamento" value={m.armazenamento_perto_do_limite.length} hint="80% ou mais do limite do plano." />
        <Stat label="Erros de importação (7 dias)" value={count("importacao")} />
        <Stat label="Falhas de PDF (7 dias)" value={count("pdf")} />
        <Stat label="Eventos de segurança (7 dias)" value={count("seguranca")} />
      </div>

      <h2 className="mb-2 font-semibold">Eventos recentes</h2>
      <Table head={["Quando", "Tipo", "Gravidade", "Mensagem"]} empty={m.eventos_recentes.length === 0 ? "Nenhum evento registrado." : undefined}>
        {m.eventos_recentes.map((e, i) => <tr key={i}><td className="px-4 py-3">{fmtDate(e.created_at)}</td><td className="px-4 py-3">{KIND[e.kind as keyof typeof KIND] ?? e.kind}</td><td className="px-4 py-3"><Badge tone={e.severity === "erro" ? "danger" : "warn"}>{e.severity}</Badge></td><td className="px-4 py-3">{e.message}</td></tr>)}
      </Table>
      <h2 className="mb-2 mt-8 font-semibold">Webhooks com falha</h2>
      <Table head={["Recebido", "Gateway", "Tipo", "Erro"]} empty={m.webhooks_recentes.length === 0 ? "Nenhum webhook com falha." : undefined}>
        {m.webhooks_recentes.map((w, i) => <tr key={i}><td className="px-4 py-3">{fmtDate(w.received_at)}</td><td className="px-4 py-3">{w.gateway}</td><td className="px-4 py-3">{w.event_type}</td><td className="px-4 py-3">{w.error ?? "—"}</td></tr>)}
      </Table>
      <h2 className="mb-2 mt-8 font-semibold">Pagamentos com problema</h2>
      <Table head={["Quando", "Cliente", "Valor", "Situação"]} empty={m.pagamentos_recentes.length === 0 ? "Nenhum pagamento com problema." : undefined}>
        {m.pagamentos_recentes.map((p, i) => <tr key={i}><td className="px-4 py-3">{fmtDate(p.created_at)}</td><td className="px-4 py-3">{p.email}</td><td className="num px-4 py-3">{brl(p.amount_cents)}</td><td className="px-4 py-3">{p.status}</td></tr>)}
      </Table>
      <h2 className="mb-2 mt-8 font-semibold">Armazenamento perto do limite</h2>
      <Table head={["Cliente", "Usado", "Limite"]} empty={m.armazenamento_perto_do_limite.length === 0 ? "Ninguém perto do limite." : undefined}>
        {m.armazenamento_perto_do_limite.map((s, i) => <tr key={i}><td className="px-4 py-3">{s.email}</td><td className="num px-4 py-3">{fmtBytes(s.usado_bytes)}</td><td className="num px-4 py-3">{fmtBytes(s.limite_bytes)}</td></tr>)}
      </Table>
    </>
  );
}
