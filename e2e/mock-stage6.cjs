// Dublê das regras de cobrança da migration 0009 para o E2E (planos, direitos, webhooks, cotas).
// NÃO é o banco real: as regras verdadeiras (RLS, travas, concorrência) são provadas por `npm run test:db`.
const crypto = require("crypto");

module.exports = function stage6({ db, USER, tick }) {
  const E = (message, code = "P0001") => ({ error: { status: 400, body: { code, message } } });
  const ok = (v) => ({ ok: v });
  const iso = (d) => new Date(d).toISOString();
  const addMonths = (d, n) => { const x = new Date(d); x.setUTCMonth(x.getUTCMonth() + n); return x; };

  const PLANS = [
    { id: crypto.randomUUID(), code: "gratuito", name: "Gratuito", description: "Para conhecer o PrintUp e precificar suas primeiras peças", price_cents: 0, price_yearly_cents: 0, trial_days: 0, sort_order: 0, is_public: true, is_active: true, highlight: false,
      limits: { max_products: 5, max_printers: 1, max_filaments: 3, max_imports_month: 3, max_pdf_month: 0, max_storage_mb: 50 }, features: { calculator: true, import_models: true } },
    { id: crypto.randomUUID(), code: "trial", name: "Teste grátis", description: "Avaliação com os recursos do Pro", price_cents: 0, price_yearly_cents: null, trial_days: 14, sort_order: 5, is_public: false, is_active: true, highlight: false,
      limits: { max_products: 200, max_printers: 3, max_filaments: 30, max_imports_month: 50, max_pdf_month: 100, max_storage_mb: 50 }, features: { calculator: true, import_models: true, quotes: true, pricing_history: true, orders: true, stock: true, production: true } },
    { id: crypto.randomUUID(), code: "pro", name: "Pro", description: "Para quem vende com orçamentos, pedidos e estoque", price_cents: 4990, price_yearly_cents: 49900, trial_days: 0, sort_order: 20, is_public: true, is_active: true, highlight: true,
      limits: { max_products: 200, max_printers: 3, max_filaments: 30, max_imports_month: 50, max_pdf_month: 100, max_storage_mb: 1000 }, features: { calculator: true, import_models: true, quotes: true, pricing_history: true, orders: true, stock: true, production: true } },
    { id: crypto.randomUUID(), code: "business", name: "Business", description: "Para quem produz em escala, com mais impressoras e limites maiores", price_cents: 9990, price_yearly_cents: 99900, trial_days: 0, sort_order: 30, is_public: true, is_active: true, highlight: false,
      limits: { max_products: null, max_printers: 10, max_filaments: null, max_imports_month: 500, max_pdf_month: null, max_storage_mb: 5000 }, features: { calculator: true, import_models: true, quotes: true, pricing_history: true, orders: true, stock: true, production: true, reports: true, production_advanced: true } },
  ];
  db.plans.push(...PLANS);
  const plan = (id) => db.plans.find((p) => p.id === id);
  const byCode = (c) => db.plans.find((p) => p.code === c);
  db.subscriptions.push({ id: crypto.randomUUID(), user_id: USER.id, plan_id: byCode("trial").id, status: "trialing", trial_ends_at: iso(Date.now() + 13 * 864e5), current_period_end: null, cancel_at_period_end: false, billing_cycle: null, pending_plan_id: null, past_due_since: null, canceled_at: null, last_event_at: null, gateway: null, gateway_customer_id: null, gateway_subscription_id: null, created_at: iso(Date.now()) });
  db.platform_settings.push({ key: "billing_grace_days", value: 7 }, { key: "trial_enabled", value: true });

  function entitlement(userId) {
    const GRACE = 7 * 864e5;
    const free = byCode("gratuito");
    const s = db.subscriptions.filter((x) => x.user_id === userId && ["trialing", "active", "past_due"].includes(x.status)).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    let state = "gratuito", paid = false, p = free;
    if (s) {
      p = plan(s.plan_id);
      const now = Date.now();
      if (s.status === "trialing") { if (new Date(s.trial_ends_at ?? now).getTime() > now) { state = "em_teste"; paid = true; } else state = "expirado"; }
      else if (s.status === "active") {
        const end = s.current_period_end ? new Date(s.current_period_end).getTime() : null;
        if (s.cancel_at_period_end && (end ?? now) <= now) state = "cancelado";
        else if (s.cancel_at_period_end) { state = "cancelamento_agendado"; paid = true; }
        else if (end !== null && end < now - GRACE) state = "inadimplente";
        else { state = "ativo"; paid = true; }
      } else if (s.status === "past_due") {
        if (new Date(s.past_due_since ?? now).getTime() + GRACE > now) { state = "pagamento_pendente"; paid = true; } else state = "inadimplente";
      }
    }
    const eff = paid ? p : free;
    return { plan_code: eff.code, status: s ? s.status : "gratuito", state, limits: eff.limits, features: eff.features, active: true, period_end: s?.current_period_end ?? null, cancel_at_period_end: s?.cancel_at_period_end ?? false, pending_plan_code: s?.pending_plan_id ? plan(s.pending_plan_id).code : null, billing_cycle: s?.billing_cycle ?? null };
  }
  const hasFeature = (f) => Boolean(entitlement(USER.id).features[f]);
  const featureErr = (f) => E(`Recurso não disponível no seu plano (${f})`);

  function logChange(s, before, reason) {
    db.subscription_changes.push({ id: crypto.randomUUID(), user_id: s.user_id, subscription_id: s.id, from_plan: before ? plan(before.plan_id).code : null, to_plan: plan(s.plan_id).code, from_status: before?.status ?? null, to_status: s.status, reason, created_at: iso(Date.now() + tick()) });
  }

  const rpc = {
    current_entitlements: () => ok([entitlement(USER.id)]),
    storage_used_bytes: () => ok(0),
    consume_quota({ p_metric, p_ref }) {
      const e = entitlement(USER.id);
      if (!e.features.quotes) return featureErr("quotes");
      const period = new Date().toISOString().slice(0, 7) + "-01";
      if (db.usage_events.some((u) => u.metric === p_metric && u.ref_id === p_ref && u.period_start === period)) return ok({ consumed: false });
      const used = db.usage_events.filter((u) => u.metric === p_metric && u.period_start === period).length;
      const limit = e.limits["max_" + p_metric];
      if (limit !== null && limit !== undefined && used >= limit) return E(`Limite do plano atingido (max_${p_metric})`);
      db.usage_events.push({ id: crypto.randomUUID(), user_id: USER.id, metric: p_metric, ref_id: p_ref, period_start: period, created_at: iso(Date.now() + tick()) });
      return ok({ consumed: true, used: used + 1 });
    },
    apply_billing_event({ p_event: ev }) {
      const gw = ev.gateway, eid = ev.event_id, type = ev.type;
      if (db.billing_events.some((b) => b.gateway === gw && b.event_id === eid)) return ok({ result: "duplicado" });
      const row = { id: crypto.randomUUID(), gateway: gw, event_id: eid, event_type: type, payload: ev, status: "recebido", user_id: null };
      db.billing_events.push(row);
      const at = new Date(ev.occurred_at || Date.now()).getTime();
      let s = ev.gateway_subscription_id ? db.subscriptions.find((x) => x.gateway === gw && x.gateway_subscription_id === ev.gateway_subscription_id) : null;
      let c = null;
      if (!s && ev.external_reference) c = db.billing_checkouts.find((x) => x.id === ev.external_reference && x.gateway === gw) ?? null;
      const user = s?.user_id ?? c?.user_id;
      if (!user) { row.status = "erro"; return ok({ result: "sem_usuario" }); }
      let fresh = true;
      if (type.startsWith("charge.") && ev.gateway_charge_id) {
        const status = { "charge.confirmed": "recebida", "charge.failed": "falhou", "charge.overdue": "vencida", "charge.refunded": "estornada", "charge.canceled": "cancelada" }[type] ?? "pendente";
        const ch = db.billing_charges.find((x) => x.gateway === gw && x.gateway_charge_id === ev.gateway_charge_id);
        if (!ch) db.billing_charges.push({ id: crypto.randomUUID(), user_id: user, subscription_id: s?.id ?? null, gateway: gw, gateway_charge_id: ev.gateway_charge_id, amount_cents: ev.amount_cents ?? 0, status, method: ev.method ?? null, due_date: ev.due_date ?? null, paid_at: status === "recebida" ? (ev.paid_at ?? ev.occurred_at) : null, invoice_url: null, last_event_at: ev.occurred_at, created_at: iso(Date.now() + tick()) });
        else if (new Date(ch.last_event_at ?? 0).getTime() <= at && !(ch.status === "recebida" && ["falhou", "vencida", "pendente"].includes(status))) { ch.status = status; ch.last_event_at = ev.occurred_at; if (status === "recebida") ch.paid_at = ev.paid_at ?? ev.occurred_at; }
        else fresh = false;
      }
      if (s && s.last_event_at && at < new Date(s.last_event_at).getTime()) fresh = false;
      const paidAt = new Date(ev.paid_at || ev.occurred_at || Date.now());
      if (type === "charge.confirmed" && fresh) {
        if (c && !s) {
          const end = c.cycle === "anual" ? addMonths(paidAt, 12) : addMonths(paidAt, 1);
          s = db.subscriptions.find((x) => x.user_id === user && ["trialing", "active", "past_due"].includes(x.status));
          const before = s ? { ...s } : null;
          const patch = { plan_id: c.plan_id, status: "active", trial_ends_at: null, billing_cycle: c.cycle, current_period_end: iso(end), cancel_at_period_end: false, pending_plan_id: null, past_due_since: null, canceled_at: null, gateway: gw, gateway_customer_id: ev.gateway_customer_id ?? null, gateway_subscription_id: ev.gateway_subscription_id ?? null, last_event_at: ev.occurred_at };
          if (s) Object.assign(s, patch);
          else { s = { id: crypto.randomUUID(), user_id: user, created_at: iso(Date.now() + tick()), ...patch }; db.subscriptions.push(s); }
          logChange(s, before, "webhook: " + type);
          c.status = "pago";
          const chg = db.billing_charges.find((x) => x.gateway_charge_id === ev.gateway_charge_id); if (chg) chg.subscription_id = s.id;
        } else if (s) {
          const before = { ...s };
          const base = Math.max(new Date(s.current_period_end ?? 0).getTime(), paidAt.getTime());
          Object.assign(s, { status: "active", current_period_end: iso(s.billing_cycle === "anual" ? addMonths(base, 12) : addMonths(base, 1)), past_due_since: null, plan_id: s.pending_plan_id ?? s.plan_id, pending_plan_id: null, last_event_at: ev.occurred_at });
          logChange(s, before, "webhook: " + type);
        }
      } else if (["charge.failed", "charge.overdue"].includes(type) && fresh && s) {
        const before = { ...s };
        if (s.status === "active") { s.status = "past_due"; s.past_due_since = s.past_due_since ?? ev.occurred_at; }
        s.last_event_at = ev.occurred_at;
        logChange(s, before, "webhook: " + type);
      } else if (type === "subscription.canceled" && fresh && s) {
        const before = { ...s };
        if (ev.cancel_at_period_end) { s.cancel_at_period_end = true; s.last_event_at = ev.occurred_at; }
        else { Object.assign(s, { status: "canceled", canceled_at: ev.occurred_at, cancel_at_period_end: false, pending_plan_id: null, last_event_at: ev.occurred_at }); }
        logChange(s, before, "webhook: " + type);
      }
      row.user_id = user; row.status = fresh ? "processado" : "ignorado";
      return ok({ result: fresh ? "processado" : "ignorado_fora_de_ordem" });
    },
  };
  return { rpc: (name, body) => (rpc[name] ? rpc[name](body) : undefined), hasFeature, featureErr };
};
