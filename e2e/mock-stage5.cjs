// Dublê das funções da migration 0008 (pedidos, produção, estoque) para o E2E. NÃO é o banco real:
// as regras verdadeiras (travas, concorrência, RLS) são provadas por `npm run test:db`; aqui só há o necessário
// para exercitar as telas com a mesma lógica de negócio, escrita de forma independente.
const crypto = require("crypto");

module.exports = function stage5({ db, USER, tick }) {
  const E = (message, code = "P0001") => ({ error: { status: 400, body: { code, message } } });
  const ok = (v) => ({ ok: v });
  const r2 = (n) => Math.round(n * 100) / 100;
  const mine = (t) => db[t].filter((r) => r.user_id === USER.id);
  const nextNumber = (t) => Math.max(0, ...mine(t).map((r) => r.number)) + 1;
  const activeJobs = (orderId) => db.production_jobs.filter((j) => j.order_id === orderId && !["concluido", "cancelado"].includes(j.stage));
  const hasJobs = (orderId) => db.production_jobs.some((j) => j.order_id === orderId && j.stage !== "cancelado");
  const reservedOf = (jobId) => db.job_reservations.filter((r) => r.job_id === jobId);
  const move = (spool, kind, dRem, dRes, jobId, orderId, key, note) => {
    if (key && db.stock_movements.some((m) => m.idempotency_key === key)) return false;
    spool.remaining_g = r2(spool.remaining_g + dRem);
    spool.reserved_g = r2(spool.reserved_g + dRes);
    if (spool.remaining_g <= 0) spool.status = "vazia";
    else if (spool.status === "nova" && dRem < 0) spool.status = "em_uso";
    db.stock_movements.push({ id: crypto.randomUUID(), user_id: USER.id, spool_id: spool.id, job_id: jobId ?? null, order_id: orderId ?? null, kind, delta_remaining: dRem, delta_reserved: dRes, balance_remaining: spool.remaining_g, balance_reserved: spool.reserved_g, idempotency_key: key ?? null, note: note ?? null, created_at: new Date(Date.now() + tick()).toISOString() });
    return true;
  };
  const spoolsFor = (filamentId, usableOnly = true) =>
    mine("filament_spools").filter((s) => s.filament_id === filamentId && (!usableOnly || ["nova", "em_uso"].includes(s.status))).sort((a, b) => (b.status === "em_uso") - (a.status === "em_uso") || String(a.purchased_at ?? "9").localeCompare(String(b.purchased_at ?? "9")) || a.created_at.localeCompare(b.created_at));

  function reserve(job) {
    let need = r2((job.est_grams ?? 0) - reservedOf(job.id).reduce((a, r) => a + r.grams, 0));
    if (need <= 0.004) return null;
    if (!job.filament_id) return E("Escolha um filamento para reservar o material");
    const sp = spoolsFor(job.filament_id).filter((s) => s.remaining_g - s.reserved_g > 0);
    const avail = sp.reduce((a, s) => a + s.remaining_g - s.reserved_g, 0);
    if (avail < need - 0.004) return E(`Estoque insuficiente: faltam ${(Math.round((need - avail) * 10) / 10).toFixed(1)} g de ${job.filament_name ?? "filamento"}`);
    for (const s of sp) {
      const take = Math.min(need, s.remaining_g - s.reserved_g);
      const ex = db.job_reservations.find((r) => r.job_id === job.id && r.spool_id === s.id);
      if (ex) ex.grams = r2(ex.grams + take); else db.job_reservations.push({ id: crypto.randomUUID(), user_id: USER.id, job_id: job.id, spool_id: s.id, grams: r2(take), created_at: new Date(Date.now() + tick()).toISOString() });
      move(s, "reserva", 0, r2(take), job.id, job.order_id);
      need = r2(need - take);
      if (need <= 0.004) break;
    }
    return null;
  }
  const release = (job) => {
    for (const r of reservedOf(job.id)) move(db.filament_spools.find((s) => s.id === r.spool_id), "liberacao", 0, -r.grams, job.id, job.order_id);
    db.job_reservations = db.job_reservations.filter((r) => r.job_id !== job.id);
  };
  function consume(job, grams, kind, key) {
    let left = grams, cost = 0;
    for (const r of reservedOf(job.id)) {
      const s = db.filament_spools.find((x) => x.id === r.spool_id);
      const take = Math.min(left, s.remaining_g);
      move(s, kind, -take, kind === "consumo" ? -r.grams : 0, job.id, job.order_id, key ? `${key}:${s.id}` : null);
      cost += take * (s.price_paid / s.initial_g);
      left = r2(left - take);
    }
    if (kind === "consumo") db.job_reservations = db.job_reservations.filter((r) => r.job_id !== job.id);
    if (left > 0.004 && job.filament_id) {
      for (const s of spoolsFor(job.filament_id).filter((x) => x.remaining_g > 0)) {
        const take = Math.min(left, s.remaining_g);
        move(s, kind, -take, 0, job.id, job.order_id, key ? `${key}:x:${s.id}` : null);
        cost += take * (s.price_paid / s.initial_g);
        left = r2(left - take);
        if (left <= 0.004) break;
      }
    }
    if (left > 0.004) return { err: E(`Estoque físico insuficiente para registrar ${(Math.round(left * 10) / 10).toFixed(1)} g. Ajuste ou cadastre a bobina e tente de novo.`) };
    return { cost: r2(cost) };
  }
  function refreshOrder(orderId) {
    const o = db.orders.find((x) => x.id === orderId);
    const items = db.order_items.filter((i) => i.order_id === orderId && i.needs_production);
    if (!items.length || !["novo", "aguardando_pagamento", "em_producao"].includes(o.status)) return;
    const done = (i) => db.production_jobs.filter((j) => j.order_item_id === i.id && j.stage === "concluido").reduce((a, j) => a + j.quantity, 0);
    if (items.every((i) => done(i) >= i.quantity)) o.status = "pronto";
  }
  function itemsFrom(orderId, rows) {
    return rows.map((i, idx) => {
      const p = i.product_id ? db.products.find((x) => x.id === i.product_id) : null;
      return { id: crypto.randomUUID(), user_id: USER.id, order_id: orderId, position: idx, kind: i.kind, product_id: p?.id ?? null, name: i.name, description: i.description ?? null, quantity: i.quantity, unit_price: i.unit_price, discount_percent: i.discount_percent ?? 0, line_total: i.line_total, unit_cost: i.unit_cost ?? p?.production_cost ?? null, material_cost: p?.material_cost ?? null, machine_cost: p?.machine_cost ?? null, other_costs: p?.other_costs ?? null, weight_g: p?.weight_g ?? null, print_minutes: p?.print_minutes ?? null, printer_id: p?.printer_id ?? null, filament_id: p?.filament_id ?? null, needs_production: i.kind === "produto" };
    });
  }
  const estCost = (items) => { const c = items.filter((i) => i.unit_cost != null); return c.length ? r2(c.reduce((a, i) => a + i.unit_cost * i.quantity, 0)) : null; };

  const rpc = {
    save_order({ p_order_id: id, p_order: q, p_items: items }) {
      if (!Array.isArray(items) || !items.length) return E("O pedido precisa ter ao menos um item");
      const sum = r2(items.reduce((a, i) => a + i.line_total, 0));
      if (Math.abs(sum - q.subtotal) > 0.005) return E("Os totais do pedido não fecham com a soma dos itens");
      let o;
      if (id) {
        o = db.orders.find((x) => x.id === id);
        if (!o) return E("Pedido não encontrado", "P0002");
        if (!["novo", "aguardando_pagamento"].includes(o.status) || hasJobs(id)) return E("Pedido em produção, entregue ou cancelado não pode ter os itens alterados");
        Object.assign(o, { customer_id: q.customer_id ?? null, customer_name: q.customer_name, customer_phone: q.customer_phone ?? null, due_date: q.due_date ?? null, payment_method: q.payment_method ?? null, notes: q.notes ?? null, subtotal: q.subtotal, discount_total: q.discount_total, total: q.total });
        db.order_items = db.order_items.filter((i) => i.order_id !== id);
      } else {
        o = { id: crypto.randomUUID(), user_id: USER.id, number: nextNumber("orders"), customer_id: q.customer_id ?? null, customer_name: q.customer_name, customer_phone: q.customer_phone ?? null, quote_id: null, order_date: new Date().toISOString().slice(0, 10), due_date: q.due_date ?? null, status: "novo", payment_method: q.payment_method ?? null, payment_status: "pendente", amount_paid: 0, subtotal: q.subtotal, discount_total: q.discount_total, total: q.total, estimated_cost: null, notes: q.notes ?? null, delivered_at: null, cancelled_at: null, created_at: new Date(Date.now() + tick()).toISOString() };
        db.orders.push(o);
      }
      const rows = itemsFrom(o.id, items);
      db.order_items.push(...rows);
      o.estimated_cost = estCost(rows);
      return ok(o.id);
    },
    convert_quote_to_order({ p_quote: qid }) {
      const q = db.quotes.find((x) => x.id === qid);
      if (!q) return E("Orçamento não encontrado", "P0002");
      const ex = db.orders.find((x) => x.quote_id === qid);
      if (ex) return ok({ order_id: ex.id, created: false });
      if (q.status !== "aprovado") return E("Só orçamentos aprovados viram pedido");
      const today = new Date();
      const due = q.production_days != null ? new Date(today.getTime() + q.production_days * 864e5).toISOString().slice(0, 10) : null;
      const o = { id: crypto.randomUUID(), user_id: USER.id, number: nextNumber("orders"), customer_id: q.customer_id, customer_name: q.customer_name, customer_phone: q.customer_phone, quote_id: qid, order_date: today.toISOString().slice(0, 10), due_date: due, status: "novo", payment_method: null, payment_status: "pendente", amount_paid: 0, subtotal: q.subtotal, discount_total: q.discount_total, total: q.total, estimated_cost: null, notes: q.notes, delivered_at: null, cancelled_at: null, created_at: new Date(Date.now() + tick()).toISOString() };
      db.orders.push(o);
      const rows = itemsFrom(o.id, db.quote_items.filter((i) => i.quote_id === qid).sort((a, b) => a.position - b.position));
      db.order_items.push(...rows);
      o.estimated_cost = estCost(rows);
      return ok({ order_id: o.id, created: true });
    },
    create_spool(a) {
      if (a.p_key && db.stock_movements.some((m) => m.idempotency_key === a.p_key)) return ok(db.stock_movements.find((m) => m.idempotency_key === a.p_key).spool_id);
      const f = a.p_filament ? db.filaments.find((x) => x.id === a.p_filament) : null;
      if (a.p_filament && !f) return E("Filamento não encontrado", "P0002");
      const initial = r2(a.p_initial_g);
      if (!(initial > 0)) return E("Informe o peso da bobina");
      const material = (a.p_material || "").trim() || f?.material;
      if (!material) return E("Informe o tipo de material");
      const s = { id: crypto.randomUUID(), user_id: USER.id, filament_id: f?.id ?? null, manufacturer: (a.p_manufacturer || "").trim() || f?.brand || null, material, color: (a.p_color || "").trim() || f?.color || null, initial_g: initial, remaining_g: 0, reserved_g: 0, price_paid: a.p_price_paid ?? 0, purchased_at: a.p_purchased_at ?? null, location: (a.p_location || "").trim() || null, status: "nova", notes: a.p_notes ?? null, created_at: new Date(Date.now() + tick()).toISOString() };
      db.filament_spools.push(s);
      move(s, "entrada", initial, 0, null, null, a.p_key, "Entrada da bobina");
      return ok(s.id);
    },
    adjust_spool({ p_spool: id, p_new_remaining: v, p_note: note, p_key: key }) {
      const s = db.filament_spools.find((x) => x.id === id);
      if (!s) return E("Bobina não encontrada", "P0002");
      if (v == null || v < 0) return E("Informe um saldo válido");
      if (v === s.remaining_g) return ok(null);
      move(s, "ajuste", r2(v - s.remaining_g), 0, null, null, key, note);
      return ok(null);
    },
    create_job({ p_item, p_qty, p_printer, p_filament, p_est_grams, p_est_minutes, p_waste_percent, p_mode }) {
      const it = db.order_items.find((x) => x.id === p_item);
      if (!it) return E("Item não encontrado", "P0002");
      const o = db.orders.find((x) => x.id === it.order_id);
      if (["cancelado", "entregue"].includes(o.status)) return E("Este pedido não aceita novas tarefas");
      if (!it.needs_production) return E("Este item não precisa de impressão");
      if (!(p_qty >= 1)) return E("Informe a quantidade do lote");
      const assigned = db.production_jobs.filter((j) => j.order_item_id === it.id && j.stage !== "cancelado").reduce((a, j) => a + j.quantity, 0);
      if (assigned + p_qty > it.quantity) return E(`Quantidade maior que a restante do item (restam ${it.quantity - assigned})`);
      const pr = p_printer ? db.printers.find((x) => x.id === p_printer) : null;
      if (p_printer && !pr) return E("Impressora não encontrada", "P0002");
      const fid = p_filament || it.filament_id;
      const fi = fid ? db.filaments.find((x) => x.id === fid) : null;
      if (fid && !fi) return E("Filamento não encontrado", "P0002");
      const grams = p_est_grams ?? (it.weight_g != null ? r2(it.weight_g * p_qty * (1 + (p_waste_percent || 0) / 100)) : null);
      const mins = p_est_minutes ?? (it.print_minutes != null ? r2(it.print_minutes * p_qty) : null);
      const j = { id: crypto.randomUUID(), user_id: USER.id, order_id: o.id, order_item_id: it.id, product_name: it.name, quantity: p_qty, printer_id: pr?.id ?? null, printer_name: pr?.name ?? null, filament_id: fi?.id ?? null, filament_name: fi?.name ?? null, stage: "aguardando", est_grams: grams, est_minutes: mins, waste_percent: p_waste_percent || 0, actual_grams: null, actual_minutes: null, failed_grams: 0, failed_minutes: 0, failed_count: 0, real_material_cost: null, real_machine_cost: null, real_other_cost: null, failed_cost: 0, notes: null, started_at: null, completed_at: null, created_at: new Date(Date.now() + tick()).toISOString() };
      db.production_jobs.push(j);
      if (p_mode === "reservar" && fid && (grams ?? 0) > 0) {
        const e = reserve(j);
        if (e) { db.production_jobs = db.production_jobs.filter((x) => x !== j); return e; }
      }
      return ok(j.id);
    },
    reserve_job({ p_job }) {
      const j = db.production_jobs.find((x) => x.id === p_job);
      if (!j) return E("Tarefa não encontrada", "P0002");
      return reserve(j) || ok(j.est_grams);
    },
    set_job_stage({ p_job, p_stage }) {
      const j = db.production_jobs.find((x) => x.id === p_job);
      if (!j) return E("Tarefa não encontrada", "P0002");
      if (!["aguardando", "preparando", "imprimindo", "acabamento"].includes(p_stage)) return E("Use Concluir para finalizar a tarefa");
      if (["concluido", "cancelado"].includes(j.stage)) return E("Tarefa já encerrada");
      j.stage = p_stage;
      j.started_at = j.started_at ?? (p_stage !== "aguardando" ? new Date().toISOString() : null);
      const o = db.orders.find((x) => x.id === j.order_id);
      if (p_stage !== "aguardando" && ["novo", "aguardando_pagamento"].includes(o.status)) o.status = "em_producao";
      return ok(null);
    },
    complete_job({ p_job, p_actual_grams, p_actual_minutes, p_note }) {
      const j = db.production_jobs.find((x) => x.id === p_job);
      if (!j) return E("Tarefa não encontrada", "P0002");
      if (j.stage === "concluido") return ok({ already: true });
      if (j.stage === "cancelado") return E("Tarefa cancelada não pode ser concluída");
      const it = db.order_items.find((x) => x.id === j.order_item_id);
      let mat = null;
      if (j.filament_id) {
        const c = consume(j, p_actual_grams ?? j.est_grams ?? 0, "consumo", `job:${j.id}:consumo`);
        if (c.err) return c.err;
        mat = c.cost;
      }
      const ratio = (j.est_minutes ?? 0) > 0 && p_actual_minutes != null ? p_actual_minutes / j.est_minutes : 1;
      Object.assign(j, { stage: "concluido", completed_at: new Date().toISOString(), started_at: j.started_at ?? new Date().toISOString(), actual_grams: p_actual_grams ?? j.est_grams, actual_minutes: p_actual_minutes ?? j.est_minutes, real_material_cost: mat, real_machine_cost: it.machine_cost != null ? r2(it.machine_cost * j.quantity * ratio) : null, real_other_cost: it.other_costs != null ? r2(it.other_costs * j.quantity) : null, notes: p_note || j.notes });
      refreshOrder(j.order_id);
      return ok({ already: false });
    },
    report_failure({ p_job, p_grams_lost, p_minutes_lost, p_note, p_key }) {
      const j = db.production_jobs.find((x) => x.id === p_job);
      if (!j) return E("Tarefa não encontrada", "P0002");
      if (["concluido", "cancelado"].includes(j.stage)) return E("Tarefa já encerrada");
      if (p_grams_lost == null || p_grams_lost < 0) return E("Informe quantas gramas foram perdidas");
      if (p_key && db.stock_movements.some((m) => (m.idempotency_key || "").startsWith(p_key))) return ok({ duplicate: true, cost: 0, shortage_for_reprint: 0 });
      let cost = 0;
      if (p_grams_lost > 0 && j.filament_id) {
        const c = consume(j, p_grams_lost, "falha", p_key);
        if (c.err) return c.err;
        cost = c.cost;
      }
      j.failed_grams = r2(j.failed_grams + p_grams_lost);
      j.failed_minutes = r2(j.failed_minutes + (p_minutes_lost || 0));
      j.failed_count += 1;
      j.failed_cost = r2(j.failed_cost + cost);
      if (p_note) j.notes = p_note;
      const phys = reservedOf(j.id).reduce((a, r) => a + db.filament_spools.find((s) => s.id === r.spool_id).remaining_g, 0);
      return ok({ duplicate: false, cost, shortage_for_reprint: Math.max(0, (j.est_grams ?? 0) - phys) });
    },
    cancel_job({ p_job }) {
      const j = db.production_jobs.find((x) => x.id === p_job);
      if (!j) return E("Tarefa não encontrada", "P0002");
      if (j.stage === "cancelado") return ok(null);
      if (j.stage === "concluido") return E("Tarefa concluída não pode ser cancelada");
      release(j);
      j.stage = "cancelado";
      return ok(null);
    },
    cancel_order({ p_order }) {
      const o = db.orders.find((x) => x.id === p_order);
      if (!o) return E("Pedido não encontrado", "P0002");
      if (o.status === "cancelado") return ok(null);
      if (o.status === "entregue") return E("Pedido entregue não pode ser cancelado");
      for (const j of activeJobs(o.id)) { release(j); j.stage = "cancelado"; }
      o.status = "cancelado";
      o.cancelled_at = new Date().toISOString();
      return ok(null);
    },
  };

  const NEXT = { novo: ["aguardando_pagamento", "em_producao", "pronto"], aguardando_pagamento: ["novo", "em_producao", "pronto"], em_producao: ["pronto", "aguardando_pagamento"], pronto: ["entregue", "em_producao"], entregue: [], cancelado: [] };
  const payStatus = (o) => (o.amount_paid <= 0 ? "pendente" : o.amount_paid >= o.total - 0.005 ? "pago" : "parcial");

  return {
    rpc: (name, body) => (rpc[name] ? rpc[name](body) : undefined),
    // POST em tabelas com regras
    beforeInsert(table, row) {
      if (table === "order_payments") {
        const o = db.orders.find((x) => x.id === row.order_id);
        if (!o) return { status: 403, body: { code: "42501", message: "new row violates row-level security policy" } };
        const net = db.order_payments.filter((p) => p.order_id === o.id).reduce((a, p) => a + (p.kind === "estorno" ? -p.amount : p.amount), 0);
        if ((row.kind ?? "recebimento") === "recebimento") {
          if (o.status === "cancelado") return E("Pedido cancelado não recebe novos pagamentos").error;
          if (net + row.amount > o.total + 0.005) return E("O valor passa do saldo a receber do pedido").error;
        } else if (row.amount > net + 0.005) return E("O estorno é maior que o valor recebido").error;
      }
      return null;
    },
    afterInsert(table, row) {
      if (table === "order_payments") {
        const o = db.orders.find((x) => x.id === row.order_id);
        o.amount_paid = r2(db.order_payments.filter((p) => p.order_id === o.id).reduce((a, p) => a + (p.kind === "estorno" ? -p.amount : p.amount), 0));
        o.payment_status = payStatus(o);
      }
    },
    beforePatch(table, row, body) {
      if (table === "orders") {
        if ("amount_paid" in body) return E("O valor recebido só muda por lançamentos de pagamento").error;
        if (body.status && body.status !== row.status) {
          if (body.status === "cancelado") return E("Para cancelar um pedido use a ação Cancelar pedido").error;
          if (!NEXT[row.status].includes(body.status)) return E(`Mudança de status não permitida (${row.status} -> ${body.status})`).error;
          if (body.status === "entregue" && activeJobs(row.id).length) return E("Há tarefas de produção em andamento neste pedido").error;
        }
      }
      if (table === "filament_spools" && ("remaining_g" in body || "reserved_g" in body || "initial_g" in body)) return E("O saldo da bobina só muda por movimentações registradas").error;
      return null;
    },
    afterPatch(table, row) {
      if (table === "orders" && row.status === "entregue" && !row.delivered_at) row.delivered_at = new Date().toISOString();
    },
    beforeDelete(table, row) {
      if (table === "orders" && (row.status !== "novo" || hasJobs(row.id) || db.order_payments.some((p) => p.order_id === row.id))) return E("Só pedidos novos, sem produção e sem pagamentos podem ser excluídos. Cancele o pedido.").error;
      return null;
    },
  };
};
