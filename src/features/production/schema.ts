import { z } from "zod";

const num = (max: number) => z.number({ error: "Informe um número válido." }).min(0, "Não pode ser negativo.").max(max, "Valor alto demais.");

export const createJobSchema = z.object({
  itemId: z.uuid(),
  quantity: z.number().int("A quantidade deve ser inteira.").min(1, "Informe a quantidade do lote.").max(100_000),
  printerId: z.uuid().nullish(),
  filamentId: z.uuid().nullish(),
  /** Em branco = usa o peso do produto × quantidade. */
  estGrams: num(10_000_000).nullish(),
  estMinutes: num(10_000_000).nullish(),
  wastePercent: num(500).default(0),
  /** `reservar` confere e reserva o filamento; `sem_reserva` cria a tarefa mesmo sem estoque suficiente. */
  mode: z.enum(["reservar", "sem_reserva"]).default("reservar"),
});
export type CreateJobPayload = z.input<typeof createJobSchema>;

export const completeJobSchema = z.object({
  jobId: z.uuid(),
  actualGrams: num(10_000_000).nullish(),
  actualMinutes: num(10_000_000).nullish(),
  note: z.string().trim().max(500).optional(),
});

export const failureSchema = z.object({
  jobId: z.uuid(),
  gramsLost: num(10_000_000),
  minutesLost: num(10_000_000).nullish(),
  note: z.string().trim().max(500).optional(),
  /** Identifica esta tentativa de registro: reenviar o mesmo formulário não baixa o estoque duas vezes. */
  key: z.string().trim().min(8).max(80),
});

export type JobActionState = { ok?: true; error?: string; message?: string };
