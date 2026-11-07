import { OffersAdminTabs } from "@/components/offers-admin-tabs";
import { Card, PageHeader } from "@/components/ui/card";
import { requireAdminPage } from "@/features/admin/guard";
import { OfferSettingsForm } from "@/features/offers/admin-forms";
import { loadOffersOverview } from "@/features/offers/admin-data";
import { ALL_CONNECTORS } from "@/features/offers/connectors/registry";
import { envMissing } from "@/features/offers/connectors/types";
import { emailConfigured } from "@/lib/email";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Ofertas · Administração" };

export default async function AdminOffersPage() {
  await requireAdminPage();
  const o = await loadOffersOverview();
  const stat = (label: string, v: number, tone?: string) => <Card className="p-4"><p className="text-xs text-muted">{label}</p><p className={`num text-2xl font-semibold ${tone ?? ""}`}>{v}</p></Card>;
  return (
    <>
      <PageHeader title="Ofertas 3D" description="Monitoramento de preços, publicação e afiliados. Nada é publicado sem passar pelas regras; a publicação automática começa desligada." />
      <OffersAdminTabs current="/admin/ofertas" />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-6" data-testid="resumo-ofertas">
        {stat("Publicadas", o.publicadas, "text-ok")}{stat("Aguardando revisão", o.emRevisao, o.emRevisao ? "text-warn" : "")}{stat("Expiradas", o.expiradas)}
        {stat("Erros nas últimas 24 h", o.erros24h, o.erros24h ? "text-danger" : "")}{stat("Cliques (7 dias)", o.cliques7d)}{stat("Cliques (30 dias)", o.cliques30d)}
      </div>
      <p className="mb-4 text-sm" data-testid="estado-publicacao">Publicação automática: <strong>{o.settings.auto_publish === true ? "LIGADA" : "desligada"}</strong>.</p>
      <div className="mb-6"><OfferSettingsForm s={o.settings} /></div>

      <Card className="mb-6 space-y-3" data-testid="estado-conectores">
        <h2 className="font-semibold">Conectores e ambiente</h2>
        <ul className="divide-y divide-line text-sm">
          {ALL_CONNECTORS.filter((c) => c.id !== "simulado" || process.env.OFFERS_ALLOW_SIMULATED === "sim").map((c) => {
            const missing = envMissing(c, process.env);
            return (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>{c.label}</span>
                <span className="text-xs text-muted">{c.status === "pronto" ? "Pronto" : c.status === "somente_desenvolvimento" ? "Só desenvolvimento" : "Preparado, não verificado"}{c.requiredEnv.length ? ` · ${missing.length ? `faltam: ${missing.join(", ")}` : "credenciais presentes"}` : ""}</span>
              </li>
            );
          })}
          <li className="flex flex-wrap items-center justify-between gap-2 py-2"><span>Rotina agendada (CRON_SECRET)</span><span className="text-xs text-muted">{process.env.CRON_SECRET && process.env.CRON_SECRET.length >= 16 ? "configurada" : "NÃO configurada: a rotina recusa chamadas"}</span></li>
          <li className="flex flex-wrap items-center justify-between gap-2 py-2"><span>Envio de e-mail dos alertas (RESEND_API_KEY, EMAIL_FROM)</span><span className="text-xs text-muted">{emailConfigured() ? "configurado" : "NÃO configurado: alertas ficam registrados, sem envio"}</span></li>
        </ul>
        <p className="text-xs text-muted">Só os nomes das variáveis aparecem aqui; os valores ficam no servidor e nunca são exibidos.</p>
      </Card>

      <Card data-testid="ultimas-execucoes">
        <h2 className="mb-2 font-semibold">Últimas execuções</h2>
        {o.runs.length === 0 ? <p className="text-sm text-muted">Nenhuma execução ainda.</p> : (
          <ul className="divide-y divide-line text-sm">{o.runs.map((r) => (
            <li key={r.id as string} className="flex flex-wrap justify-between gap-2 py-2"><span>{((r.offer_sources as { name?: string } | null)?.name) ?? "—"} · {r.trigger as string}</span><span className="text-muted">{r.status as string} · {formatDateTime(r.started_at as string)}</span></li>
          ))}</ul>
        )}
      </Card>
    </>
  );
}
