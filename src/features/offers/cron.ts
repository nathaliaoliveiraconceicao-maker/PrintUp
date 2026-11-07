import { processAlerts, type AlertDeps } from "./alerts-runner";
import { runSource, sweepExpired, type CollectorDeps, type RunStats } from "./collector";
import { connectorFor } from "./connectors/registry";
import { envMissing } from "./connectors/types";
import type { OffersRepo } from "./repo";

export type CronSummary = {
  fontes: { fonte: string; status: string; stats: RunStats }[];
  expiradas: number;
  alertas: { avaliados: number; enviados: number; sem_provedor: number; falhas: number } | null;
  parou_por_tempo: boolean;
};

/**
 * Rotina agendada: roda as fontes vencidas (uma por vez, dentro de um orçamento de tempo), expira ofertas antigas e dispara alertas.
 * Idempotente: pode ser chamada de novo sem duplicar ofertas, observações recentes ou avisos.
 */
export async function runScheduled(a: { repo: OffersRepo; collector: Omit<CollectorDeps, "repo" | "connector">; alerts: Omit<AlertDeps, "repo"> | null; budgetMs?: number; env?: Record<string, string | undefined>; clock?: () => number }): Promise<CronSummary> {
  const clock = a.clock ?? Date.now;
  const started = clock();
  const budget = a.budgetMs ?? 45_000;
  const env = a.env ?? process.env;
  const now = (a.collector.now ?? (() => new Date()))();
  const summary: CronSummary = { fontes: [], expiradas: 0, alertas: null, parou_por_tempo: false };
  for (const { store, source } of await a.repo.dueSources(now)) {
    if (clock() - started > budget) { summary.parou_por_tempo = true; break; }
    const connector = connectorFor(source.connector, env);
    const missing = connector ? envMissing(connector, env) : ["conector"];
    if (!connector || missing.length) {
      await a.repo.recordError(null, source.id, "configuracao", connector ? `Faltam variáveis de ambiente: ${missing.join(", ")}` : "Conector indisponível neste ambiente.");
      await a.repo.touchSource(source.id, "falhou", now);
      summary.fontes.push({ fonte: source.name, status: "falhou", stats: { vistos: 0, ignorados: 0, novos_produtos: 0, ofertas_criadas: 0, ofertas_atualizadas: 0, publicadas: 0, em_revisao: 0, descartadas: 0, expiradas: 0, erros: 1 } });
      continue;
    }
    const r = await runSource({ ...a.collector, repo: a.repo, connector, env }, store, source, "cron");
    summary.fontes.push({ fonte: source.name, status: r.status, stats: r.stats });
  }
  summary.expiradas = await sweepExpired(a.repo, now);
  if (a.alerts) summary.alertas = await processAlerts({ ...a.alerts, repo: a.repo, now: () => now });
  return summary;
}
