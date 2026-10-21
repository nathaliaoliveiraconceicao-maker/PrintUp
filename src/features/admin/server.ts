import type { AdminContext } from "./guard";

type Supa = AdminContext["supabase"];

export type Overview = {
  usuarios_total: number; usuarios_novos: number;
  por_estado: Record<string, number>; por_plano: Record<string, number>;
  mrr_cents: number; arr_cents: number; mrr_em_cancelamento_cents: number;
  recebido_cents: number; estornado_cents: number;
  cancelamentos_periodo: number; base_inicio_periodo: number; taxa_cancelamento: number | null;
};
export type UserRow = { user_id: string; full_name: string | null; email: string; created_at: string; last_sign_in_at: string | null; plan_code: string; state: string; products: number; printers: number; filaments: number; max_products: number | null; max_printers: number | null; total: number };
export type SubRow = { user_id: string; email: string; full_name: string | null; plan_code: string; status: string; state: string; contracted_at: string; next_charge: string | null; last_paid_at: string | null; last_paid_cents: number | null; canceled_at: string | null; cancel_at_period_end: boolean; gateway: string | null; gateway_subscription_id: string | null; total: number };
export type PlanRowAdmin = { id: string; code: string; name: string; description: string | null; price_cents: number; price_yearly_cents: number | null; trial_days: number; limits: Record<string, number | null>; features: Record<string, boolean>; is_public: boolean; is_active: boolean; highlight: boolean; sort_order: number; subscribers: number };
export type CouponRow = { id: string; code: string; description: string | null; plan_code: string; days: number; restricted_email: string | null; max_redemptions: number | null; redeemed_count: number; valid_from: string; valid_until: string | null; is_active: boolean; created_at: string; status: string };
export type AuditRow = { id: string; actor_email: string | null; actor_kind: string; action: string; entity: string | null; entity_id: string | null; details: Record<string, unknown>; created_at: string; total: number };

export type UserDetail = {
  perfil: { id: string; nome: string | null; negocio: string | null; papel: string; cadastro: string; email: string; ultimo_acesso: string | null };
  plano: { codigo: string; estado: string; fim_periodo: string | null; cancela_no_fim: boolean; plano_pendente: string | null; ciclo: string | null; limites: Record<string, number | null>; recursos: Record<string, boolean> };
  uso: { produtos: number; impressoras: number; filamentos: number; modelos_importados: number; precificacoes: number; orcamentos: number; pedidos: number; armazenamento_bytes: number };
  assinatura: { id: string; plano: string; status: string; contratada_em: string; proxima_cobranca: string | null; fim_teste: string | null; cancelada_em: string | null; cancela_no_fim: boolean; gateway: string | null; gateway_assinatura: string | null } | null;
  mudancas: { from_plan: string | null; to_plan: string | null; from_status: string | null; to_status: string | null; reason: string | null; created_at: string }[];
  cobrancas: { amount_cents: number; status: string; method: string | null; due_date: string | null; paid_at: string | null; gateway: string }[];
  eventos: { gateway: string; event_type: string; status: string; occurred_at: string | null; error: string | null }[];
};
export type UsageMetrics = { produtos: number; precificacoes: number; modelos_importados: number; orcamentos: number; pedidos: number; impressoras: number; filamentos: number; armazenamento_bytes: number; por_plano: Record<string, { usuarios: number; produtos: number; orcamentos: number; pedidos: number }> };
export type Monitoring = {
  webhooks_erro_7d: number; webhooks_recentes: { gateway: string; event_type: string; status: string; error: string | null; received_at: string }[];
  pagamentos_falhos_30d: number; pagamentos_recentes: { status: string; amount_cents: number; method: string | null; created_at: string; email: string }[];
  armazenamento_perto_do_limite: { email: string; usado_bytes: number; limite_bytes: number }[];
  eventos_por_tipo_7d: Record<string, number>; eventos_recentes: { kind: string; severity: string; message: string; meta: Record<string, unknown>; created_at: string }[];
};

async function call<T>(supabase: Supa, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(`Falha ao consultar (${fn}).`);
  return data as T;
}

export const loadOverview = (s: Supa, from: Date, to: Date) => call<Overview>(s, "admin_overview", { p_from: from.toISOString(), p_to: to.toISOString() });
export const loadUsers = (s: Supa, a: { q?: string; plan?: string; state?: string; limit: number; offset: number }) =>
  call<UserRow[]>(s, "admin_list_users", { p_search: a.q || null, p_plan: a.plan || null, p_state: a.state || null, p_limit: a.limit, p_offset: a.offset });
export const loadUserDetail = (s: Supa, id: string) => call<UserDetail>(s, "admin_user_detail", { p_user: id });
export const loadSubscriptions = (s: Supa, a: { q?: string; state?: string; limit: number; offset: number }) =>
  call<SubRow[]>(s, "admin_list_subscriptions", { p_state: a.state || null, p_search: a.q || null, p_limit: a.limit, p_offset: a.offset });
export const loadPlans = (s: Supa) => call<PlanRowAdmin[]>(s, "admin_list_plans");
export const loadCoupons = (s: Supa) => call<CouponRow[]>(s, "admin_list_coupons");
export const loadUsageMetrics = (s: Supa) => call<UsageMetrics>(s, "admin_usage_metrics");
export const loadMonitoring = (s: Supa) => call<Monitoring>(s, "admin_monitoring");
export const loadAudit = (s: Supa, a: { action?: string; limit: number; offset: number }) =>
  call<AuditRow[]>(s, "admin_list_audit", { p_action: a.action || null, p_limit: a.limit, p_offset: a.offset });
