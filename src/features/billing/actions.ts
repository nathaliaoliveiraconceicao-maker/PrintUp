"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { eventsFromSnapshot } from "@/lib/billing/events";
import { resolveGateway, type BillingCycle, type BillingGateway, type CanonicalEvent } from "@/lib/billing/gateway";
import { SimulatedGateway } from "@/lib/billing/simulated";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { couponCodeSchema } from "@/features/admin/schema";
import { PLAN_COLUMNS, type PlanRow } from "./server";

export type BillingActionState = { ok?: true; error?: string; url?: string; message?: string };

const planInput = z.object({ planCode: z.string().regex(/^[a-z0-9_]{2,40}$/), cycle: z.enum(["mensal", "anual"]) });

type Ctx = { user: { id: string; email: string | null; name: string | null }; admin: ReturnType<typeof createAdminClient>; gateway: BillingGateway };

const DISABLED: Record<string, string> = {
  sem_gateway: "Os pagamentos ainda não estão habilitados. Assim que forem, você poderá contratar por aqui.",
  sem_chave_servidor: "Os pagamentos ainda não foram configurados neste ambiente.",
  simulador_bloqueado: "Os pagamentos ainda não estão habilitados neste ambiente.",
  mercadopago_incompleto: "Os pagamentos ainda não foram configurados neste ambiente.",
  cobranca_real_bloqueada: "Os pagamentos reais ainda não foram autorizados neste ambiente.",
};

/** Autentica o usuário (getUser valida o token) e prepara o gateway. Tudo daqui em diante parte do id do usuário logado. */
async function context(): Promise<{ ctx: Ctx } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada. Entre novamente." };
  const status = await resolveGateway();
  if (!status.enabled) return { error: DISABLED[status.reason] };
  return { ctx: { user: { id: user.id, email: user.email ?? null, name: (user.user_metadata?.full_name as string | undefined) ?? null }, admin: createAdminClient(), gateway: status.gateway } };
}

async function planByCode(admin: Ctx["admin"], code: string): Promise<PlanRow | null> {
  const { data } = await admin.from("plans").select(PLAN_COLUMNS).eq("code", code).eq("is_active", true).eq("is_public", true).maybeSingle();
  return (data as PlanRow | null) ?? null;
}
const priceFor = (p: PlanRow, cycle: BillingCycle) => (cycle === "anual" ? p.price_yearly_cents : p.price_cents);

async function liveGatewaySub(admin: Ctx["admin"], userId: string) {
  const { data } = await admin
    .from("subscriptions")
    .select("id, plan_id, status, billing_cycle, cancel_at_period_end, gateway_subscription_id")
    .eq("user_id", userId)
    .in("status", ["active", "past_due"])
    .not("gateway_subscription_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as { id: string; plan_id: string; status: string; billing_cycle: BillingCycle | null; cancel_at_period_end: boolean; gateway_subscription_id: string } | null;
}

/** Abre um checkout. A assinatura NÃO é ativada aqui: só quando o gateway confirmar o pagamento (webhook). */
export async function startCheckout(planCode: string, cycle: BillingCycle): Promise<BillingActionState> {
  const parsed = planInput.safeParse({ planCode, cycle });
  if (!parsed.success) return { error: "Plano inválido." };
  const c = await context();
  if ("error" in c) return { error: c.error };
  const { user, admin, gateway } = c.ctx;

  const plan = await planByCode(admin, parsed.data.planCode);
  const amount = plan ? priceFor(plan, parsed.data.cycle) : null;
  if (!plan || !amount || amount <= 0) return { error: "Este plano não está disponível para contratação." };
  if (await liveGatewaySub(admin, user.id)) return { error: "Você já tem uma assinatura. Use “Alterar plano” na página Minha assinatura." };

  await admin.from("billing_checkouts").update({ status: "cancelado" }).eq("user_id", user.id).eq("status", "aberto");
  const { data: co, error } = await admin
    .from("billing_checkouts")
    .insert({ user_id: user.id, plan_id: plan.id, cycle: parsed.data.cycle, gateway: gateway.id })
    .select("id")
    .single();
  if (error || !co) return { error: "Não foi possível iniciar a contratação. Tente novamente." };

  try {
    const r = await gateway.createCheckout({
      checkoutId: co.id as string, planCode: plan.code, planName: plan.name, amountCents: amount, cycle: parsed.data.cycle,
      gatewayPriceId: undefined, customer: { userId: user.id, email: user.email, name: user.name },
    });
    await admin.from("billing_checkouts").update({ gateway_ref: r.gatewayRef, checkout_url: r.url }).eq("id", co.id);
    return { ok: true, url: r.url };
  } catch {
    await admin.from("billing_checkouts").update({ status: "cancelado" }).eq("id", co.id);
    return { error: "O serviço de pagamento não respondeu. Tente novamente em instantes." };
  }
}

/** Upgrade vale na hora (depois que o gateway aceita a troca); downgrade fica agendado para a próxima renovação. */
export async function changePlan(planCode: string, cycle: BillingCycle): Promise<BillingActionState> {
  const parsed = planInput.safeParse({ planCode, cycle });
  if (!parsed.success) return { error: "Plano inválido." };
  const c = await context();
  if ("error" in c) return { error: c.error };
  const { user, admin, gateway } = c.ctx;

  const sub = await liveGatewaySub(admin, user.id);
  if (!sub) return { error: "Você ainda não tem uma assinatura paga. Escolha um plano para contratar." };
  if (sub.cancel_at_period_end) return { error: "Sua assinatura está com cancelamento agendado. Aguarde o fim do período para contratar de novo." };
  const target = await planByCode(admin, parsed.data.planCode);
  const amount = target ? priceFor(target, parsed.data.cycle) : null;
  if (!target || !amount) return { error: "Este plano não está disponível." };
  const { data: current } = await admin.from("plans").select("id, price_cents").eq("id", sub.plan_id).maybeSingle();
  if (current?.id === target.id && sub.billing_cycle === parsed.data.cycle) return { error: "Você já está neste plano." };

  try {
    await gateway.changePlan(sub.gateway_subscription_id, { planCode: target.code, amountCents: amount, cycle: parsed.data.cycle });
  } catch {
    return { error: "O serviço de pagamento não aceitou a troca. Tente novamente em instantes." };
  }
  const upgrade = target.price_cents > ((current?.price_cents as number | undefined) ?? 0);
  const { error } = await admin
    .from("subscriptions")
    .update(upgrade ? { plan_id: target.id, billing_cycle: parsed.data.cycle, pending_plan_id: null } : { pending_plan_id: target.id })
    .eq("id", sub.id)
    .eq("user_id", user.id);
  if (error) return { error: "Não foi possível registrar a troca. Fale com o suporte." };
  revalidatePath("/assinatura");
  return { ok: true, message: upgrade ? `Plano alterado para ${target.name}.` : `Downgrade para ${target.name} agendado para a próxima renovação.` };
}

/** Cancela no fim do período já pago (primeiro no gateway; só então é registrado aqui). Nada é apagado. */
export async function cancelSubscription(): Promise<BillingActionState> {
  const c = await context();
  if ("error" in c) return { error: c.error };
  const { user, admin, gateway } = c.ctx;
  const sub = await liveGatewaySub(admin, user.id);
  if (!sub) return { error: "Você não tem uma assinatura paga para cancelar." };
  if (sub.cancel_at_period_end) return { ok: true, message: "O cancelamento já está agendado." };
  try {
    await gateway.cancelSubscription(sub.gateway_subscription_id, true);
  } catch {
    return { error: "O serviço de pagamento não confirmou o cancelamento. Tente novamente em instantes." };
  }
  const { error } = await admin.from("subscriptions").update({ cancel_at_period_end: true }).eq("id", sub.id).eq("user_id", user.id);
  if (error) return { error: "Não foi possível registrar o cancelamento. Fale com o suporte." };
  revalidatePath("/assinatura");
  return { ok: true, message: "Cancelamento agendado. Seu plano segue ativo até o fim do período pago e seus dados continuam salvos." };
}

/** Confere no gateway a situação real e aplica o que faltou (webhooks podem ter se perdido). Idempotente. */
export async function reconcileMine(): Promise<BillingActionState> {
  const c = await context();
  if ("error" in c) return { error: c.error };
  const { user, admin, gateway } = c.ctx;
  const sub = await liveGatewaySub(admin, user.id);
  if (!sub) return { ok: true, message: "Nada a conferir: você não tem assinatura paga." };
  const snap = await gateway.fetchSnapshot(sub.gateway_subscription_id).catch(() => null);
  if (!snap) return { ok: true, message: "Situação conferida: nenhuma diferença encontrada." };
  let applied = 0;
  for (const e of eventsFromSnapshot(gateway.id, sub.gateway_subscription_id, snap)) {
    const { data } = await admin.rpc("apply_billing_event", { p_event: e });
    if ((data as { result?: string } | null)?.result === "processado") applied++;
  }
  revalidatePath("/assinatura");
  return { ok: true, message: applied > 0 ? `Situação atualizada (${applied} ajuste${applied > 1 ? "s" : ""}).` : "Situação conferida: nenhuma diferença encontrada." };
}

/** O cliente resgata um cupom de acesso (teste/cortesia/convite). Quem decide é o banco (validade, limite, e-mail do convite, concorrência). */
export async function redeemCoupon(_: BillingActionState, formData: FormData): Promise<BillingActionState> {
  const code = couponCodeSchema.safeParse(formData.get("code"));
  if (!code.success) return { error: code.error.issues[0]?.message ?? "Informe o código." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada. Entre novamente." };
  const { data, error } = await supabase.rpc("redeem_coupon", { p_code: code.data });
  if (error) return { error: error.code === "P0001" && error.message ? error.message : "Não foi possível usar o código agora. Tente novamente." };
  revalidatePath("/assinatura");
  revalidatePath("/");
  const r = data as { plan_name?: string; days?: number } | null;
  return { ok: true, message: `Código aplicado: acesso ao plano ${r?.plan_name ?? ""} por ${r?.days ?? ""} dias.` };
}

// ───────── Simulador (só desenvolvimento/testes; bloqueado em produção por `resolveGateway`) ─────────
export type SimKind = "aprovado" | "recusado" | "renovacao" | "falha" | "cancelamento_agendado" | "cancelamento" | "duplicado";

async function postSigned(events: CanonicalEvent[]): Promise<{ status: number }> {
  const secret = process.env.BILLING_WEBHOOK_SECRET;
  if (!secret) return { status: 0 };
  const h = await headers();
  const host = h.get("host");
  if (!host) return { status: 0 };
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  const { body, signature } = SimulatedGateway.sign(secret, events);
  const res = await fetch(`${proto}://${host}/api/webhooks/billing`, { method: "POST", body, headers: { "content-type": "application/json", "x-simulated-signature": signature }, cache: "no-store" });
  return { status: res.status };
}

export async function simulate(kind: SimKind, checkoutId?: string): Promise<BillingActionState> {
  const c = await context();
  if ("error" in c) return { error: c.error };
  const { user, admin, gateway } = c.ctx;
  if (gateway.id !== "simulado") return { error: "Disponível só no ambiente de simulação." };
  if (!process.env.BILLING_WEBHOOK_SECRET) return { error: "Defina BILLING_WEBHOOK_SECRET para simular pagamentos." };

  const uid = () => `sim_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const base = { gateway: "simulado", occurred_at: now };
  let events: CanonicalEvent[] = [];

  if (kind === "aprovado" || kind === "recusado") {
    if (!checkoutId) return { error: "Checkout não informado." };
    const { data: co } = await admin.from("billing_checkouts").select("id, plan_id, cycle, status").eq("id", checkoutId).eq("user_id", user.id).maybeSingle();
    if (!co || co.status !== "aberto") return { error: "Este checkout não está mais aberto." };
    const { data: plan } = await admin.from("plans").select("price_cents, price_yearly_cents").eq("id", co.plan_id).maybeSingle();
    const amount = (co.cycle === "anual" ? plan?.price_yearly_cents : plan?.price_cents) ?? 0;
    const common = { ...base, external_reference: checkoutId, gateway_subscription_id: `sim_sub_${checkoutId}`, gateway_customer_id: `sim_cus_${user.id}`, gateway_charge_id: uid(), amount_cents: amount as number, method: "cartao" as const };
    events = [{ ...common, event_id: uid(), type: kind === "aprovado" ? "charge.confirmed" : "charge.failed", paid_at: kind === "aprovado" ? now : undefined }];
  } else {
    const sub = await liveGatewaySub(admin, user.id);
    if (!sub) return { error: "Você não tem uma assinatura simulada ativa." };
    const sid = sub.gateway_subscription_id;
    const common = { ...base, gateway_subscription_id: sid };
    if (kind === "renovacao") events = [{ ...common, event_id: uid(), type: "charge.confirmed", gateway_charge_id: uid(), paid_at: now, amount_cents: 0, method: "cartao" }];
    if (kind === "falha") events = [{ ...common, event_id: uid(), type: "charge.failed", gateway_charge_id: uid(), amount_cents: 0, method: "cartao" }];
    if (kind === "cancelamento_agendado") events = [{ ...common, event_id: uid(), type: "subscription.canceled", cancel_at_period_end: true }];
    if (kind === "cancelamento") events = [{ ...common, event_id: uid(), type: "subscription.canceled" }];
    if (kind === "duplicado") {
      const e: CanonicalEvent = { ...common, event_id: uid(), type: "charge.confirmed", gateway_charge_id: uid(), paid_at: now, amount_cents: 0 };
      events = [e, e];
    }
  }
  const r = await postSigned(events);
  revalidatePath("/assinatura");
  if (r.status !== 200) return { error: `O webhook respondeu ${r.status || "sem resposta"}.` };
  return { ok: true, message: "Evento simulado enviado ao webhook." };
}
