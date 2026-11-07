"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dbErrorMessage, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { alertRuleSchema } from "./alert-schema";
import { materialFromCategory, planPriceChange } from "./calculator-link";
import { loadPublicOffers } from "./data";
import { UUID_RE } from "./redirect";
import { formatBRL } from "@/lib/utils";

export type ApplyState = { ok?: true; error?: string; message?: string; needsConfirm?: { current: number; next: number; savingPer100g: number } };

const applySchema = z.object({
  offerId: z.string().regex(UUID_RE),
  target: z.union([z.literal("novo"), z.string().regex(UUID_RE)]),
  name: z.string().trim().min(1).max(80).optional(),
  confirm: z.boolean().optional(),
});

/**
 * "Usar este preço na minha calculadora": só o id da oferta e o filamento escolhido vêm do navegador.
 * O preço por kg é recalculado no servidor a partir da oferta publicada. Substituir um valor existente exige confirmação.
 * Cálculos já salvos (pricings) e produtos NÃO mudam: continuam como estavam até o usuário pedir para recalcular.
 */
export async function applyOfferPrice(payload: unknown): Promise<ApplyState> {
  const p = applySchema.safeParse(payload);
  if (!p.success) return { error: "Pedido inválido." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Entre na sua conta para usar este preço na calculadora." };

  const offer = (await loadPublicOffers(supabase)).find((o) => o.id === p.data.offerId);
  if (!offer || offer.perKgCents === null) return { error: "Esta oferta não tem preço por kg conhecido (peso do filamento não identificado)." };

  if (p.data.target === "novo") {
    const name = p.data.name ?? offer.title.slice(0, 80);
    const plan = planPriceChange(offer.perKgCents, null);
    if (plan.kind !== "novo") return { error: "Pedido inválido." };
    const { error } = await supabase.from("filaments").insert({ name, brand: offer.brand, material: materialFromCategory(offer.category), price_per_kg: plan.newPerKg, spool_weight_g: offer.weightG ?? 1000, notes: `Preço da oferta (${offer.storeName}), verificado ${new Date(offer.lastCheckedAt).toLocaleDateString("pt-BR")}` });
    if (error) return { error: dbErrorMessage(error) };
    revalidatePath("/filamentos");
    return { ok: true, message: `Filamento “${name}” cadastrado com ${formatBRL(plan.newPerKg)}/kg.` };
  }

  const { data: fil } = await supabase.from("filaments").select("id, name, price_per_kg").eq("id", p.data.target).maybeSingle();
  if (!fil) return { error: "Filamento não encontrado." };
  const plan = planPriceChange(offer.perKgCents, Number(fil.price_per_kg));
  if (plan.kind === "igual") return { ok: true, message: "O preço já é este. Nada foi alterado." };
  if (plan.kind === "atualizar" && !p.data.confirm) return { needsConfirm: { current: plan.current, next: plan.newPerKg, savingPer100g: plan.savingPer100g } };
  if (plan.kind !== "atualizar") return { error: "Pedido inválido." };
  const { error } = await supabase.from("filaments").update({ price_per_kg: plan.newPerKg }).eq("id", fil.id);
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath("/filamentos");
  revalidatePath("/calculadora");
  return { ok: true, message: `“${fil.name}” agora custa ${formatBRL(plan.newPerKg)}/kg (antes ${formatBRL(plan.current)}). Seus cálculos e produtos já salvos continuam como estavam; use “Recalcular produtos” para atualizá-los.` };
}

// ───────── Alertas ─────────
export async function createAlert(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = alertRuleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos.", fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])) };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada. Entre novamente." };
  const { error } = await supabase.from("offer_alerts").insert({ user_id: user.id, rule: parsed.data.rule, channel: "email" });
  if (error) return { error: error.code === "P0001" ? error.message : dbErrorMessage(error) };
  revalidatePath("/alertas");
  return { ok: "Alerta criado. Você será avisado por e-mail." };
}

export async function setAlertActive(id: string, active: boolean): Promise<FormState> {
  if (!UUID_RE.test(id)) return { error: "Alerta inválido." };
  const supabase = await createClient();
  const { error } = await supabase.from("offer_alerts").update({ is_active: active }).eq("id", id);
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath("/alertas");
  return { ok: active ? "Alerta ativado." : "Alerta pausado." };
}

export async function deleteAlert(id: string): Promise<FormState> {
  if (!UUID_RE.test(id)) return { error: "Alerta inválido." };
  const supabase = await createClient();
  const { error } = await supabase.from("offer_alerts").delete().eq("id", id);
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath("/alertas");
  return { ok: "Alerta apagado." };
}
