"use server";

import { revalidatePath } from "next/cache";
import { resolveGateway } from "@/lib/billing/gateway";
import { dbErrorMessage, zodToState, type FormState } from "@/lib/forms";
import { createAdminClient } from "@/lib/supabase/admin";
import { currentAdmin } from "./guard";
import { logEvent } from "./log";
import { couponFormSchema, courtesySchema, planFormSchema, reasonSchema, settingsSchema, toBrtIso, toPlanPatch } from "./schema";

/** As funções `admin_*` escrevem as mensagens de regra (P0001) em português: seguras para mostrar. O resto passa pelo filtro padrão. */
function rpcError(err: { code?: string; message?: string }): string {
  if (err.code === "P0001" && err.message) return err.message;
  if (err.code === "42501") return "Acesso restrito.";
  return dbErrorMessage(err);
}

const DENIED: FormState = { error: "Acesso restrito." };

export async function updatePlan(code: string, _: FormState, formData: FormData): Promise<FormState> {
  const ctx = await currentAdmin();
  if (!ctx) return DENIED;
  if (!/^[a-z0-9_]{2,40}$/.test(code)) return { error: "Plano inválido." };
  if (formData.get("confirmar") !== "on") return { error: "Marque a confirmação: limites e recursos valem para todos os assinantes do plano." };
  const parsed = planFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodToState(parsed.error);
  const { error } = await ctx.supabase.rpc("admin_update_plan", { p_code: code, p_patch: toPlanPatch(parsed.data) });
  if (error) return { error: rpcError(error) };
  revalidatePath("/admin/planos");
  revalidatePath("/planos");
  return { ok: "Plano atualizado e registrado na auditoria." };
}

export async function grantCourtesy(_: FormState, formData: FormData): Promise<FormState> {
  const ctx = await currentAdmin();
  if (!ctx) return DENIED;
  const parsed = courtesySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodToState(parsed.error);
  const d = parsed.data;
  const { error } = await ctx.supabase.rpc("admin_grant_courtesy", { p_user: d.userId, p_plan_code: d.planCode, p_days: Math.round(d.days), p_reason: d.reason });
  if (error) return { error: rpcError(error) };
  revalidatePath(`/admin/usuarios/${d.userId}`);
  return { ok: "Cortesia concedida." };
}

export async function endCourtesy(_: FormState, formData: FormData): Promise<FormState> {
  const ctx = await currentAdmin();
  if (!ctx) return DENIED;
  const parsed = reasonSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodToState(parsed.error);
  const { error } = await ctx.supabase.rpc("admin_end_courtesy", { p_user: parsed.data.userId, p_reason: parsed.data.reason });
  if (error) return { error: rpcError(error) };
  revalidatePath(`/admin/usuarios/${parsed.data.userId}`);
  return { ok: "Cortesia encerrada." };
}

/**
 * Cancelamento de assinatura PAGA: primeiro o gateway (para de cobrar), só depois o banco registra, na mesma ordem
 * do cancelamento feito pelo cliente. Nunca marca pagamento algum.
 */
export async function scheduleCancel(_: FormState, formData: FormData): Promise<FormState> {
  const ctx = await currentAdmin();
  if (!ctx) return DENIED;
  const parsed = reasonSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodToState(parsed.error);
  if (formData.get("confirmar") !== "on") return { error: "Marque a confirmação para cancelar." };
  const status = await resolveGateway();
  if (!status.enabled) return { error: "O gateway de pagamento não está habilitado neste ambiente." };
  const { data: sub } = await createAdminClient()
    .from("subscriptions")
    .select("gateway_subscription_id, gateway")
    .eq("user_id", parsed.data.userId)
    .in("status", ["active", "past_due"])
    .not("gateway_subscription_id", "is", null)
    .maybeSingle();
  if (!sub?.gateway_subscription_id) return { error: "O cliente não tem assinatura paga." };
  if (sub.gateway !== status.gateway.id) return { error: "Esta assinatura pertence a outro gateway; cancele-a por lá." };
  try {
    await status.gateway.cancelSubscription(sub.gateway_subscription_id as string, true);
  } catch {
    await logEvent("pagamento", "erro", "Falha ao cancelar assinatura no gateway (ação administrativa)", { gateway: status.gateway.id }, parsed.data.userId);
    return { error: "O gateway não confirmou o cancelamento. Nada foi alterado; tente de novo." };
  }
  const { error } = await ctx.supabase.rpc("admin_schedule_cancel", { p_user: parsed.data.userId, p_reason: parsed.data.reason });
  if (error) return { error: `Cancelado no gateway, mas o registro falhou (${rpcError(error)}). Repita a ação para sincronizar.` };
  revalidatePath(`/admin/usuarios/${parsed.data.userId}`);
  return { ok: "Cancelamento agendado para o fim do período pago." };
}

export async function createCoupon(_: FormState, formData: FormData): Promise<FormState> {
  const ctx = await currentAdmin();
  if (!ctx) return DENIED;
  const parsed = couponFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodToState(parsed.error);
  const d = parsed.data;
  const { error } = await ctx.supabase.rpc("admin_create_coupon", {
    p_code: d.code, p_description: d.description ?? null, p_plan_code: d.planCode, p_days: Math.round(d.days),
    p_restricted_email: d.restrictedEmail ?? null, p_max_redemptions: d.maxRedemptions === null ? null : Math.round(d.maxRedemptions),
    p_valid_from: toBrtIso(d.validFrom), p_valid_until: toBrtIso(d.validUntil),
  });
  if (error) return { error: rpcError(error) };
  revalidatePath("/admin/cupons");
  return { ok: `Cupom ${d.code} criado.` };
}

export async function setCouponActive(id: string, active: boolean): Promise<FormState> {
  const ctx = await currentAdmin();
  if (!ctx) return DENIED;
  if (!/^[0-9a-f-]{36}$/.test(id)) return { error: "Cupom inválido." };
  const { error } = await ctx.supabase.rpc("admin_set_coupon_active", { p_id: id, p_active: active });
  if (error) return { error: rpcError(error) };
  revalidatePath("/admin/cupons");
  return { ok: active ? "Cupom ativado." : "Cupom desativado." };
}

export async function saveSettings(_: FormState, formData: FormData): Promise<FormState> {
  const ctx = await currentAdmin();
  if (!ctx) return DENIED;
  const parsed = settingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodToState(parsed.error);
  const d = parsed.data;
  const values: [string, unknown][] = [
    ["billing_grace_days", Math.round(d.billing_grace_days)], ["trial_enabled", d.trial_enabled],
    ["support_email", d.support_email], ["terms_url", d.terms_url], ["privacy_url", d.privacy_url],
  ];
  for (const [key, value] of values) {
    const { error } = await ctx.supabase.rpc("admin_set_setting", { p_key: key, p_value: value });
    if (error) return { error: rpcError(error) };
  }
  revalidatePath("/admin/configuracoes");
  revalidatePath("/planos");
  return { ok: "Configurações salvas e registradas na auditoria." };
}

export type ProbeState = { error?: string; lines?: import("./probe").ProbeLine[] };

/** Teste de conexão com o Mercado Pago (só conta de teste). Mostra o que o Mercado Pago aceita ou recusa, sem segredos. */
export async function runMercadoPagoProbe(): Promise<ProbeState> {
  const ctx = await currentAdmin();
  if (!ctx) return { error: "Acesso restrito." };
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (!token || !site) return { error: "Configure MERCADOPAGO_ACCESS_TOKEN e NEXT_PUBLIC_SITE_URL antes de testar." };
  const { probeMercadoPago } = await import("./probe");
  const lines = await probeMercadoPago({ accessToken: token, siteUrl: site, testPayerEmail: process.env.MERCADOPAGO_TEST_PAYER_EMAIL });
  await logEvent("sistema", "info", "Teste de conexão com o Mercado Pago executado", {}, ctx.userId);
  return { lines };
}
