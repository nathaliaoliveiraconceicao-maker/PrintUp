// Dublê das funções administrativas (migration 0010) para o E2E. NÃO é o banco real: as regras verdadeiras
// (papéis, RLS, auditoria imutável, cupons, concorrência) são provadas por `npm run test:db`.
const crypto = require("crypto");

module.exports = function stage7({ db, USER, tick }) {
  const state = { admin: false };
  const E = (message) => ({ error: { status: 400, body: { code: "P0001", message } } });
  const DENIED = { error: { status: 403, body: { code: "42501", message: "Acesso restrito" } } };
  const ok = (v) => ({ ok: v });
  const iso = () => new Date(Date.now() + tick()).toISOString();
  db.coupons = db.coupons ?? [];
  db.coupon_redemptions = db.coupon_redemptions ?? [];
  db.admin_audit_log = db.admin_audit_log ?? [];
  const audit = (action, entity, entity_id, details = {}) => db.admin_audit_log.push({ id: crypto.randomUUID(), actor_email: USER.email, actor_kind: "superadmin", action, entity, entity_id, details, created_at: iso() });
  const couponStatus = (c) => (!c.is_active ? "desativado" : c.valid_until && new Date(c.valid_until) <= new Date() ? "expirado" : c.max_redemptions && c.redeemed_count >= c.max_redemptions ? "esgotado" : "ativo");

  const fns = {
    is_superadmin: () => ok(state.admin),
    admin_overview: () => ok({ usuarios_total: 7, usuarios_novos: 3, por_estado: { ativo: 2, em_teste: 3, inadimplente: 1, cancelado: 1 }, por_plano: { pro: 2, trial: 3, gratuito: 2 }, mrr_cents: 9148, arr_cents: 109776, mrr_em_cancelamento_cents: 0, recebido_cents: 54890, estornado_cents: 0, cancelamentos_periodo: 1, base_inicio_periodo: 4, taxa_cancelamento: 0.25 }),
    admin_list_users: () => ok([{ user_id: USER.id, full_name: "Teste", email: USER.email, created_at: iso(), last_sign_in_at: null, plan_code: "trial", state: "em_teste", products: db.products.length, printers: db.printers.length, filaments: 0, max_products: 200, max_printers: 3, total: 1 }]),
    admin_list_subscriptions: () => ok([]),
    admin_list_plans: () => ok(db.plans.map((p) => ({ ...p, subscribers: 0 }))),
    admin_update_plan({ p_code, p_patch }) {
      const p = db.plans.find((x) => x.code === p_code);
      if (!p) return E("Plano não encontrado");
      if (p.code === "gratuito" && p_patch.is_active === false) return E("O plano Gratuito não pode ser desativado");
      Object.assign(p, { name: p_patch.name ?? p.name, price_cents: p_patch.price_cents ?? p.price_cents, price_yearly_cents: p_patch.price_yearly_cents === undefined ? p.price_yearly_cents : p_patch.price_yearly_cents, limits: p_patch.limits ?? p.limits, features: p_patch.features ?? p.features });
      audit("plano.alterado", "plans", p.code, { campos: Object.keys(p_patch) });
      return ok(null);
    },
    admin_list_coupons: () => ok(db.coupons.map((c) => ({ ...c, plan_code: db.plans.find((p) => p.id === c.plan_id)?.code, status: couponStatus(c) }))),
    admin_create_coupon(a) {
      const code = String(a.p_code ?? "").trim().toUpperCase();
      if (!/^[A-Z0-9_-]{4,32}$/.test(code)) return E("Código inválido: use 4 a 32 letras, números, - ou _");
      if (db.coupons.some((c) => c.code === code)) return E("Já existe um cupom com este código");
      const plan = db.plans.find((p) => p.code === a.p_plan_code && p.code !== "gratuito");
      if (!plan) return E("Plano inválido para o cupom");
      db.coupons.push({ id: crypto.randomUUID(), code, description: a.p_description, plan_id: plan.id, days: a.p_days, restricted_email: a.p_restricted_email, max_redemptions: a.p_max_redemptions, redeemed_count: 0, valid_from: a.p_valid_from ?? iso(), valid_until: a.p_valid_until, is_active: true, created_at: iso() });
      audit("cupom.criado", "coupons", code);
      return ok(db.coupons.at(-1).id);
    },
    admin_set_coupon_active({ p_id, p_active }) {
      const c = db.coupons.find((x) => x.id === p_id);
      if (!c) return E("Cupom não encontrado");
      c.is_active = p_active;
      audit(p_active ? "cupom.ativado" : "cupom.desativado", "coupons", c.code);
      return ok(null);
    },
    redeem_coupon({ p_code }) {
      const c = db.coupons.find((x) => x.code === String(p_code ?? "").trim().toUpperCase());
      if (c && db.coupon_redemptions.some((r) => r.coupon_id === c.id)) return E("Você já usou este código");
      if (!c || couponStatus(c) !== "ativo") return E("Código inválido ou expirado");
      const plan = db.plans.find((p) => p.id === c.plan_id);
      const s = db.subscriptions.find((x) => ["trialing", "active", "past_due"].includes(x.status));
      const end = new Date(Date.now() + c.days * 864e5).toISOString();
      if (s) Object.assign(s, { plan_id: plan.id, status: "trialing", trial_ends_at: end });
      else db.subscriptions.push({ id: crypto.randomUUID(), user_id: USER.id, plan_id: plan.id, status: "trialing", trial_ends_at: end, current_period_end: null, cancel_at_period_end: false, billing_cycle: null, pending_plan_id: null, past_due_since: null, canceled_at: null, last_event_at: null, gateway: null, gateway_customer_id: null, gateway_subscription_id: null, created_at: iso() });
      c.redeemed_count += 1;
      db.coupon_redemptions.push({ coupon_id: c.id, user_id: USER.id });
      return ok({ plan_code: plan.code, plan_name: plan.name, days: c.days, ends_at: end });
    },
    admin_set_setting({ p_key, p_value }) {
      if (!["billing_grace_days", "trial_enabled", "support_email", "terms_url", "privacy_url"].includes(p_key)) return E("Configuração desconhecida");
      if (p_key === "support_email" && p_value && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p_value)) return E("E-mail inválido");
      const row = db.platform_settings.find((r) => r.key === p_key);
      if (row) row.value = p_value; else db.platform_settings.push({ key: p_key, value: p_value });
      audit("configuracao.alterada", "platform_settings", p_key);
      return ok(null);
    },
    admin_usage_metrics: () => ok({ produtos: db.products.length, precificacoes: db.pricings.length, modelos_importados: db.imported_models.length, orcamentos: db.quotes.length, pedidos: db.orders.length, impressoras: db.printers.length, filamentos: 0, armazenamento_bytes: 0, por_plano: { trial: { usuarios: 1, produtos: db.products.length, orcamentos: db.quotes.length, pedidos: db.orders.length } } }),
    admin_monitoring: () => ok({ webhooks_erro_7d: 0, webhooks_recentes: [], pagamentos_falhos_30d: 0, pagamentos_recentes: [], armazenamento_perto_do_limite: [], eventos_por_tipo_7d: {}, eventos_recentes: [] }),
    admin_list_audit({ p_action }) {
      const rows = db.admin_audit_log.filter((r) => !p_action || r.action === p_action).sort((a, b) => b.created_at.localeCompare(a.created_at));
      return ok(rows.map((r) => ({ ...r, total: rows.length })));
    },
  };
  return {
    state,
    rpc: (name, body) => {
      if (!fns[name]) return undefined;
      if (name.startsWith("admin_") && !state.admin) return DENIED;
      return fns[name](body ?? {});
    },
    names: Object.keys(fns),
  };
};
