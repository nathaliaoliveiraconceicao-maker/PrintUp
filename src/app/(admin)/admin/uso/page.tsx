import { Card, PageHeader } from "@/components/ui/card";
import { requireAdminPage } from "@/features/admin/guard";
import { loadUsageMetrics } from "@/features/admin/server";
import { fmtBytes, Stat, Table } from "@/features/admin/ui";

export const metadata = { title: "Uso · Administração" };

export default async function UsagePage() {
  const { supabase } = await requireAdminPage();
  const u = await loadUsageMetrics(supabase);
  const byPlan = Object.entries(u.por_plano).sort((a, b) => b[1].usuarios - a[1].usuarios);
  return (
    <>
      <PageHeader title="Uso da plataforma" description="Totais agregados de todos os clientes. Nenhum conteúdo individual é exibido." />
      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="uso-totais">
        <Stat label="Produtos cadastrados" value={u.produtos} />
        <Stat label="Precificações realizadas" value={u.precificacoes} />
        <Stat label="Modelos importados" value={u.modelos_importados} />
        <Stat label="Orçamentos gerados" value={u.orcamentos} />
        <Stat label="Pedidos registrados" value={u.pedidos} />
        <Stat label="Impressoras" value={u.impressoras} />
        <Stat label="Filamentos" value={u.filamentos} />
        <Stat label="Armazenamento de modelos" value={fmtBytes(u.armazenamento_bytes)} hint="Arquivos em model-files." />
      </div>
      <h2 className="mb-2 font-semibold">Uso por plano</h2>
      <Table head={["Plano (efetivo)", "Usuários", "Produtos", "Orçamentos", "Pedidos"]} empty={byPlan.length === 0 ? "Sem dados." : undefined}>
        {byPlan.map(([code, v]) => <tr key={code}><td className="px-4 py-3 font-medium">{code === "trial" ? "Teste grátis" : code}</td><td className="num px-4 py-3">{v.usuarios}</td><td className="num px-4 py-3">{v.produtos}</td><td className="num px-4 py-3">{v.orcamentos}</td><td className="num px-4 py-3">{v.pedidos}</td></tr>)}
      </Table>
      <Card className="mt-6 text-sm text-muted">Para ver o consumo de um cliente específico (só contagens), abra o cliente em Usuários.</Card>
    </>
  );
}
