"use server";

import { revalidatePath } from "next/cache";
import { dbErrorMessage } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { completeJobSchema, createJobSchema, failureSchema, type JobActionState } from "./schema";

function refresh(orderId?: string) {
  revalidatePath("/producao");
  revalidatePath("/pedidos");
  revalidatePath("/filamentos/estoque");
  revalidatePath("/filamentos");
  revalidatePath("/");
  if (orderId) revalidatePath(`/pedidos/${orderId}`);
}

/** Cria um lote. Em `reservar`, confere o estoque do filamento e reserva; sem material suficiente, não cria e explica quanto falta. */
export async function createJob(payload: unknown): Promise<JobActionState> {
  const parsed = createJobSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const v = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_job", {
    p_item: v.itemId,
    p_qty: v.quantity,
    p_printer: v.printerId ?? null,
    p_filament: v.filamentId ?? null,
    p_est_grams: v.estGrams ?? null,
    p_est_minutes: v.estMinutes ?? null,
    p_waste_percent: v.wastePercent,
    p_mode: v.mode,
  });
  if (error || !data) return { error: dbErrorMessage(error ?? {}) };
  refresh();
  return { ok: true, message: v.mode === "reservar" ? "Lote criado e material reservado." : "Lote criado sem reservar material." };
}

export async function reserveJob(jobId: string): Promise<JobActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("reserve_job", { p_job: jobId });
  if (error) return { error: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: "Material reservado." };
}

export async function setJobStage(jobId: string, stage: string): Promise<JobActionState> {
  if (!["aguardando", "preparando", "imprimindo", "acabamento"].includes(stage)) return { error: "Etapa inválida." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_job_stage", { p_job: jobId, p_stage: stage });
  if (error) return { error: dbErrorMessage(error) };
  refresh();
  return { ok: true };
}

/** Conclui registrando o consumo real. Repetir não baixa o estoque de novo. */
export async function completeJob(payload: unknown): Promise<JobActionState> {
  const parsed = completeJobSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("complete_job", {
    p_job: v.jobId,
    p_actual_grams: v.actualGrams ?? null,
    p_actual_minutes: v.actualMinutes ?? null,
    p_note: v.note ?? null,
  });
  if (error) return { error: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: "Tarefa concluída e consumo registrado." };
}

/** Falha de impressão: baixa o material perdido e mantém a tarefa aberta para a reimpressão. */
export async function reportFailure(payload: unknown): Promise<JobActionState> {
  const parsed = failureSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const v = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_failure", {
    p_job: v.jobId,
    p_grams_lost: v.gramsLost,
    p_minutes_lost: v.minutesLost ?? null,
    p_note: v.note ?? null,
    p_key: v.key,
  });
  if (error) return { error: dbErrorMessage(error) };
  refresh();
  const r = data as { duplicate?: boolean; shortage_for_reprint?: number } | null;
  if (r?.duplicate) return { ok: true, message: "Essa falha já tinha sido registrada." };
  const short = r?.shortage_for_reprint ?? 0;
  return {
    ok: true,
    message: short > 0 ? `Falha registrada. Atenção: faltam ${Math.round(short)} g reservados para a reimpressão — confira o estoque.` : "Falha registrada. O material perdido saiu do estoque.",
  };
}

export async function cancelJob(jobId: string): Promise<JobActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_job", { p_job: jobId });
  if (error) return { error: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: "Tarefa cancelada e material liberado." };
}
