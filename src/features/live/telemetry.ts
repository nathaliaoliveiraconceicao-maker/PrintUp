import { z } from "zod";
import { cleanText } from "@/features/imports/text";
import { COMMAND_CAPABILITIES, PRINTER_STATES } from "./adapters/types";

/**
 * Protocolo conector → PrintUp (telemetria) e usuário → conector (comandos). Tudo que chega do conector é
 * tratado como NÃO confiável: o servidor revalida com estes schemas antes de gravar (Fase 2).
 */

const nullableNum = (min: number, max: number) => z.number().finite().min(min).max(max).nullable();
const nullableInt = (min: number, max: number) => z.number().int().min(min).max(max).nullable();

/** Texto livre vindo da impressora (nome do arquivo etc.): limpo e limitado. */
const safeText = (max: number) =>
  z
    .string()
    .nullable()
    .transform((v) => cleanText(v, max));

export const stateSchema = z.object({
  connected: z.boolean(),
  state: z.enum(PRINTER_STATES),
  jobName: safeText(120),
  progressPercent: nullableNum(0, 100),
  elapsedSeconds: nullableInt(0, 60 * 60 * 24 * 30),
  remainingSeconds: nullableInt(0, 60 * 60 * 24 * 30),
  nozzleC: nullableNum(-50, 600),
  nozzleTargetC: nullableNum(0, 600),
  bedC: nullableNum(-50, 300),
  bedTargetC: nullableNum(0, 300),
  layer: z
    .object({ current: z.number().int().min(0).max(1_000_000), total: nullableInt(1, 1_000_000) })
    .nullable(),
  filamentUsedMm: nullableNum(0, 100_000_000),
  observedAt: z.iso.datetime(),
});

/** Um envio do conector. `seq` cresce a cada envio: o servidor ignora o que chegar fora de ordem ou repetido. */
export const telemetryEnvelopeSchema = z.object({
  v: z.literal(1),
  printerId: z.uuid(),
  seq: z.number().int().min(0),
  state: stateSchema,
});
export type TelemetryEnvelope = z.infer<typeof telemetryEnvelopeSchema>;

/**
 * Pedido de comando feito pelo usuário. A confirmação explícita é obrigatória e o pedido expira:
 * comando antigo não é executado se o conector estava offline. `key` torna o pedido idempotente.
 */
export const commandRequestSchema = z.object({
  printerId: z.uuid(),
  command: z.enum(COMMAND_CAPABILITIES),
  confirm: z.literal(true, { error: "Confirme o comando antes de enviar." }),
  key: z.string().min(8).max(80),
});
export type CommandRequest = z.infer<typeof commandRequestSchema>;

export const COMMAND_TTL_SECONDS = 120;

export const commandExpired = (createdAtMs: number, nowMs: number) => nowMs - createdAtMs > COMMAND_TTL_SECONDS * 1000;

/** Frescor do dado exibido. A interface nunca mostra dado velho como se fosse atual. */
export type Freshness = "ao_vivo" | "atrasado" | "desatualizado" | "sem_dados";

export const LIVE_MAX_AGE_SECONDS = 20;
export const STALE_AFTER_SECONDS = 90;

export function freshness(observedAt: string | null | undefined, nowMs: number): Freshness {
  if (!observedAt) return "sem_dados";
  const t = Date.parse(observedAt);
  if (!Number.isFinite(t)) return "sem_dados";
  const age = (nowMs - t) / 1000;
  if (age <= LIVE_MAX_AGE_SECONDS) return "ao_vivo";
  if (age <= STALE_AFTER_SECONDS) return "atrasado";
  return "desatualizado";
}

/**
 * Indicador de conexão exibido: se o dado está desatualizado, a impressora é tratada como "sem sinal",
 * mesmo que o último estado dissesse "conectada".
 */
export function connectionIndicator(connected: boolean | null, f: Freshness): "conectada" | "instavel" | "sem_sinal" {
  if (connected === null || f === "sem_dados" || f === "desatualizado") return "sem_sinal";
  if (!connected) return "sem_sinal";
  return f === "ao_vivo" ? "conectada" : "instavel";
}

/**
 * Limita a frequência de gravação: grava se algo mudou E passou o intervalo mínimo, ou como "batimento"
 * periódico para provar que o conector está vivo. Evita consultas e escritas excessivas.
 */
export const MIN_WRITE_INTERVAL_MS = 3_000;
export const HEARTBEAT_MS = 30_000;

export function shouldWrite(opts: { changed: boolean; lastWriteMs: number | null; nowMs: number }): boolean {
  if (opts.lastWriteMs === null) return true;
  const since = opts.nowMs - opts.lastWriteMs;
  if (since < 0) return true; // relógio voltou: melhor gravar do que travar
  if (opts.changed) return since >= MIN_WRITE_INTERVAL_MS;
  return since >= HEARTBEAT_MS;
}
