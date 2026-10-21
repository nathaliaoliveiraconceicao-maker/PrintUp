import { z } from "zod";

const text = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));

export const createSpoolSchema = z.object({
  filamentId: z.uuid().nullish(),
  manufacturer: text(80),
  material: text(40),
  color: text(40),
  initialG: z.number({ error: "Informe o peso da bobina." }).gt(0, "Informe o peso da bobina.").max(1_000_000),
  pricePaid: z.number({ error: "Informe um valor válido." }).min(0).max(1_000_000),
  purchasedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  location: text(80),
  notes: text(500),
  key: z.string().trim().min(8).max(80),
});

export const adjustSpoolSchema = z.object({
  spoolId: z.uuid(),
  newRemaining: z.number({ error: "Informe um saldo válido." }).min(0, "Informe um saldo válido.").max(1_000_000),
  note: z.string().trim().min(1, "Explique o motivo do ajuste.").max(300),
  key: z.string().trim().min(8).max(80),
});

export const spoolMetaSchema = z.object({
  spoolId: z.uuid(),
  manufacturer: text(80),
  color: text(40),
  location: text(80),
  status: z.enum(["nova", "em_uso", "vazia", "descartada"]),
  notes: text(500),
});

export type StockActionState = { ok?: true; error?: string; message?: string };

export interface SpoolRow {
  id: string;
  filament_id: string | null;
  manufacturer: string | null;
  material: string;
  color: string | null;
  initial_g: number;
  remaining_g: number;
  reserved_g: number;
  price_paid: number;
  purchased_at: string | null;
  location: string | null;
  status: "nova" | "em_uso" | "vazia" | "descartada";
  notes: string | null;
  created_at: string;
}
export const SPOOL_COLUMNS = "id, filament_id, manufacturer, material, color, initial_g, remaining_g, reserved_g, price_paid, purchased_at, location, status, notes, created_at";

export interface MovementRow {
  id: string;
  spool_id: string;
  job_id: string | null;
  order_id: string | null;
  kind: "entrada" | "reserva" | "liberacao" | "consumo" | "falha" | "ajuste";
  delta_remaining: number;
  delta_reserved: number;
  balance_remaining: number;
  balance_reserved: number;
  note: string | null;
  created_at: string;
}
export const MOVEMENT_KIND_LABEL: Record<MovementRow["kind"], string> = {
  entrada: "Entrada",
  reserva: "Reserva",
  liberacao: "Reserva liberada",
  consumo: "Consumo",
  falha: "Falha de impressão",
  ajuste: "Ajuste",
};
export const SPOOL_STATUS_LABEL: Record<SpoolRow["status"], string> = { nova: "Nova", em_uso: "Em uso", vazia: "Vazia", descartada: "Descartada" };

export const MOVEMENT_COLUMNS = "id, spool_id, job_id, order_id, kind, delta_remaining, delta_reserved, balance_remaining, balance_reserved, note, created_at";
