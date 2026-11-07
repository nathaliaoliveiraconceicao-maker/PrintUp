import { OffersAdminTabs } from "@/components/offers-admin-tabs";
import { Card, PageHeader } from "@/components/ui/card";
import { requireAdminPage } from "@/features/admin/guard";
import { loadRunsAndErrors } from "@/features/offers/admin-data";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Execuções e erros · Administração" };

export default async function RunsPage() {
  await requireAdminPage();
  const { runs, errors } = await loadRunsAndErrors();
  return (
    <>
      <PageHeader title="Execuções e erros de coleta" description="O que a rotina agendada e as execuções manuais fizeram. Mensagens sem dados pessoais nem segredos." />
      <OffersAdminTabs current="/admin/ofertas/execucoes" />
      <h2 className="mb-3 font-semibold">Execuções</h2>
      <Card className="mb-8" data-testid="execucoes">
        {runs.length === 0 ? <p className="text-sm text-muted">Nenhuma execução ainda.</p> : (
          <ul className="divide-y divide-line text-sm">{runs.map((r) => {
            const st = (r.stats ?? {}) as Record<string, number>;
            return <li key={r.id as string} className="space-y-0.5 py-2"><p className="flex flex-wrap justify-between gap-2"><span>{(r.offer_sources as { name?: string } | null)?.name ?? "—"} · {r.trigger as string} · <strong>{r.status as string}</strong></span><span className="text-muted">{formatDateTime(r.started_at as string)}</span></p><p className="text-xs text-muted">{st.vistos ?? 0} vistos · {st.ofertas_criadas ?? 0} novas · {st.ofertas_atualizadas ?? 0} atualizadas · {st.em_revisao ?? 0} em revisão · {st.publicadas ?? 0} publicadas · {st.erros ?? 0} erros{r.error ? ` · ${r.error as string}` : ""}</p></li>;
          })}</ul>
        )}
      </Card>
      <h2 className="mb-3 font-semibold">Erros de integração</h2>
      <Card data-testid="erros-coleta">
        {errors.length === 0 ? <p className="text-sm text-muted">Nenhum erro registrado.</p> : (
          <ul className="divide-y divide-line text-sm">{errors.map((e) => <li key={e.id as number} className="py-2"><p className="flex flex-wrap justify-between gap-2"><span><strong>{e.kind as string}</strong> · {(e.offer_sources as { name?: string } | null)?.name ?? "—"}</span><span className="text-muted">{formatDateTime(e.created_at as string)}</span></p><p className="text-xs text-muted">{e.message as string}</p></li>)}</ul>
        )}
      </Card>
    </>
  );
}
