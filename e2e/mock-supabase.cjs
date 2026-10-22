// Dublê LOCAL do Supabase (Auth + PostgREST + Storage mínimos) usado só pelos testes E2E do PrintUp.
// NÃO é o Supabase real: não valida RLS, constraints nem triggers (isso é coberto por `npm run test:db`).
// Credenciais de teste abaixo são fictícias e só existem neste arquivo.
const http = require("http");
const crypto = require("crypto");

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const USER = { id: "11111111-1111-1111-1111-111111111111", aud: "authenticated", role: "authenticated", email: "teste@printup.local", app_metadata: {}, user_metadata: { full_name: "Teste Mock" }, created_at: new Date().toISOString() };
const jwt = () => `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: USER.id, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
const session = () => ({ access_token: jwt(), token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: "r" + ++n, user: USER });

let PASSWORD = "senha-de-teste-123";
const TABLES = ["printers", "filaments", "cost_settings", "products", "pricings", "audit_log", "imported_models", "print_profiles", "customers", "business_profiles", "quotes", "quote_items", "profiles", "orders", "order_items", "order_payments", "production_jobs", "job_reservations", "filament_spools", "stock_movements", "plans", "subscriptions", "platform_settings", "subscription_changes", "billing_customers", "billing_checkouts", "billing_charges", "billing_events", "usage_events", "coupons", "coupon_redemptions", "admin_audit_log", "app_events"];
const db = Object.fromEntries(TABLES.map((t) => [t, []]));
const LIMITS = { printers: 1, filaments: 5, products: 10 };
// Valores padrão das colunas (o banco real os aplica; o dublê precisa imitar para os testes não enxergarem `undefined`).
const DEFAULTS = { billing_checkouts: { status: "aberto" }, printers: { purchase_price: 0, lifespan_hours: null, power_watts: 0, hourly_cost: 0, hourly_includes_energy: false, hourly_includes_wear: false, hourly_includes_fixed: false, wear_per_hour: 0 }, filaments: { material: "PLA", spool_weight_g: 1000, min_stock_g: 250 }, cost_settings: { monthly_fixed_costs: 0, fixed_allocation: "per_hour", productive_hours_per_month: 160, monthly_units: 0, energy_price_per_kwh: 0.9, labor_hourly_rate: 0, loss_percent: 5, sale_fee_percent: 0, sale_fee_fixed: 0, tax_percent: 0, margin_percent: 30 }, products: { stock_qty: 0, archived_at: null }, business_profiles: { brand_color: "#d94e1b", default_validity_days: 7 } };
const AUDITED = ["printers", "filaments", "products", "pricings", "imported_models"];
db.profiles.push({ id: "11111111-1111-1111-1111-111111111111", full_name: "Teste Mock", business_name: null, onboarding_done_at: null });
const objects = new Map(); // caminho no bucket -> { bytes, contentType }
let n = 0;

const cors = (req) => ({
  "access-control-allow-origin": req.headers.origin || "*",
  "access-control-allow-headers": req.headers["access-control-request-headers"] || "*",
  "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS",
});
const send = (req, res, code, body, headers = {}) => {
  res.writeHead(code, { "content-type": "application/json", ...cors(req), ...headers });
  res.end(body === undefined ? "" : JSON.stringify(body));
};
const readRaw = (req) => new Promise((r) => { const c = []; req.on("data", (d) => c.push(d)); req.on("end", () => r(Buffer.concat(c))); });
const readBody = async (req) => { const b = await readRaw(req); return b.length ? JSON.parse(b.toString("utf8")) : null; };

function filter(rows, q) {
  for (const [k, v] of q) {
    if (["select", "order", "limit", "offset", "on_conflict"].includes(k)) continue;
    let m = /^eq\.(.*)$/.exec(v);
    if (m) rows = rows.filter((r) => String(r[k]) === m[1]);
    m = /^neq\.(.*)$/.exec(v);
    if (m) rows = rows.filter((r) => String(r[k]) !== m[1]);
    m = /^gte\.(.*)$/.exec(v);
    if (m) rows = rows.filter((r) => String(r[k] ?? "") >= m[1]);
    if (v === "not.is.null") rows = rows.filter((r) => r[k] != null);
    if (v === "is.null") rows = rows.filter((r) => r[k] == null);
    if (v === "is.not.null") rows = rows.filter((r) => r[k] != null);
    m = /^in\.\((.*)\)$/.exec(v);
    if (m) { const set = new Set(m[1].split(",").map((x) => x.replace(/^"|"$/g, ""))); rows = rows.filter((r) => set.has(String(r[k]))); }
  }
  return rows;
}
function sortRows(rows, order) {
  const specs = order.split(",").map((s) => { const [col, dir] = s.split("."); return { col, desc: dir === "desc" }; });
  return [...rows].sort((a, b) => {
    for (const { col, desc } of specs) {
      const x = a[col], y = b[col];
      if (x == null && y == null) continue;
      if (x == null) return 1;
      if (y == null) return -1;
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
      if (c !== 0) return desc ? -c : c;
    }
    return 0;
  });
}

const BUCKETS = ["model-files", "user-images", "quote-pdfs"];
const key = (bucket, path) => `${bucket}/${path}`;
const hasObj = (bucket, path) => objects.has(bucket === "model-files" ? path : key(bucket, path));
// model-files mantém as chaves antigas (caminho puro) para não mexer nos testes do importador; os novos buckets usam "bucket/caminho".
const okey = (bucket, path) => (bucket === "model-files" ? path : key(bucket, path));

async function storage(req, res, p) {
  if (p === "/storage/v1/object/copy" && req.method === "POST") {
    const b = await readBody(req);
    const from = objects.get(okey(b.bucketId, b.sourceKey));
    if (!from) return send(req, res, 404, { message: "Object not found" });
    if (!b.destinationKey.startsWith(USER.id + "/")) return send(req, res, 403, { message: "new row violates row-level security policy" });
    objects.set(okey(b.bucketId, b.destinationKey), { bytes: Buffer.from(from.bytes), contentType: from.contentType });
    return send(req, res, 200, { Key: `${b.bucketId}/${b.destinationKey}` });
  }
  const m = /^\/storage\/v1\/object\/(?:(sign|list)\/)?([a-z-]+)(?:\/(.*))?$/.exec(p);
  if (!m || !BUCKETS.includes(m[2])) return send(req, res, 404, { message: "storage: rota não suportada no dublê" });
  const [, verb, bucket, rest] = m;
  const path = rest ? decodeURIComponent(rest) : "";
  if (verb === "sign" && req.method === "GET") {
    const o = objects.get(okey(bucket, path));
    if (!o) return send(req, res, 404, { message: "not found" });
    res.writeHead(200, { "content-type": o.contentType, ...cors(req) });
    return res.end(o.bytes);
  }
  if (verb === "sign" && req.method === "POST" && !path) {
    const b = await readBody(req);
    return send(req, res, 200, b.paths.map((pp) => objects.has(okey(bucket, pp))
      ? { error: null, path: pp, signedURL: `/object/sign/${bucket}/${encodeURIComponent(pp).replace(/%2F/g, "/")}?token=t` }
      : { error: "Object not found", path: pp, signedURL: null }));
  }
  if (verb === "sign" && req.method === "POST") {
    if (!objects.has(okey(bucket, path))) return send(req, res, 404, { message: "Object not found" });
    return send(req, res, 200, { signedURL: `/object/sign/${bucket}/${encodeURIComponent(path).replace(/%2F/g, "/")}?token=t` });
  }
  if (verb === "list" && req.method === "POST") {
    const b = await readBody(req);
    const prefix = b.prefix || "";
    const out = [...objects.entries()]
      .filter(([k]) => k.startsWith(bucket === "model-files" ? "" : bucket + "/"))
      .map(([k, o]) => [bucket === "model-files" ? k : k.slice(bucket.length + 1), o])
      .filter(([pp]) => pp.slice(0, pp.lastIndexOf("/")) === prefix && (!b.search || pp.includes(b.search)))
      .map(([pp, o]) => ({ name: pp.slice(pp.lastIndexOf("/") + 1), id: pp, metadata: { size: o.bytes.length, mimetype: o.contentType } }));
    return send(req, res, 200, out);
  }
  if (!verb && !path && req.method === "DELETE") {
    const b = await readBody(req);
    const removed = [];
    for (const pp of b.prefixes || []) if (objects.delete(okey(bucket, pp))) removed.push({ name: pp });
    return send(req, res, 200, removed);
  }
  if (!verb && path && req.method === "GET") {
    const o = objects.get(okey(bucket, path));
    if (!o) return send(req, res, 400, { statusCode: "404", error: "not_found", message: "Object not found" });
    res.writeHead(200, { "content-type": o.contentType, ...cors(req) });
    return res.end(o.bytes);
  }
  if (!verb && path && (req.method === "POST" || req.method === "PUT")) {
    if (!path.startsWith(USER.id + "/")) return send(req, res, 403, { message: "new row violates row-level security policy", statusCode: "403" });
    let bytes = await readRaw(req);
    let contentType = req.headers["content-type"] || "application/octet-stream";
    // O storage-js envia Blob/File como multipart/form-data: guardamos só o conteúdo do arquivo, como o Storage real faz.
    const mp = /^multipart\/form-data;\s*boundary=(.+)$/.exec(contentType);
    if (mp) {
      const raw = bytes.toString("latin1");
      const start = raw.indexOf("\r\n\r\n", raw.indexOf("filename=")) + 4;
      const end = raw.lastIndexOf(`\r\n--${mp[1]}`);
      const head = raw.slice(raw.indexOf("filename="), start);
      contentType = /Content-Type:\s*([^\r\n]+)/i.exec(head)?.[1] ?? "application/octet-stream";
      bytes = bytes.subarray(start, end);
    }
    if (objects.has(okey(bucket, path))) return send(req, res, 409, { message: "The resource already exists" });
    objects.set(okey(bucket, path), { bytes, contentType });
    return send(req, res, 200, { Key: `${bucket}/${path}`, Id: crypto.randomUUID() });
  }
  return send(req, res, 404, { message: "storage: rota não suportada no dublê" });
}


const stage5 = require("./mock-stage5.cjs")({ db, USER, tick: () => ++n });
const stage6 = require("./mock-stage6.cjs")({ db, USER, tick: () => ++n });
const stage7 = require("./mock-stage7.cjs")({ db, USER, tick: () => ++n });
const STAGE6_RPC = ["current_entitlements", "consume_quota", "apply_billing_event", "storage_used_bytes"];
const FEATURE_OF_RPC = { save_order: "orders", create_spool: "stock", create_job: "production" };
const STAGE5_RPC = ["save_order", "convert_quote_to_order", "create_spool", "adjust_spool", "create_job", "reserve_job", "set_job_stage", "complete_job", "report_failure", "cancel_job", "cancel_order"];
const rpcResponse = (res, req, r) => (r.error ? send(req, res, r.error.status, r.error.body) : send(req, res, 200, r.ok === undefined ? null : r.ok));

// Equivalente do `save_quote` do banco: número por usuário, travas de status e conferência da soma dos itens.
async function saveQuoteRpc(req, res) {
  const { p_quote_id: id, p_quote: q, p_items: items } = await readBody(req);
  const bad = (message) => send(req, res, 400, { code: "P0001", message });
  if (!Array.isArray(items) || items.length === 0) return bad("O orçamento precisa ter ao menos um item");
  let row;
  if (id) {
    row = db.quotes.find((r) => r.id === id);
    if (!row) return send(req, res, 400, { code: "P0002", message: "Orçamento não encontrado" });
    if (row.status !== "rascunho") return bad("Orçamento enviado ou decidido não pode ser alterado. Duplique-o para fazer mudanças.");
    Object.assign(row, q);
    db.quote_items = db.quote_items.filter((i) => i.quote_id !== id);
  } else {
    const number = Math.max(0, ...db.quotes.map((r) => r.number)) + 1;
    row = { id: crypto.randomUUID(), user_id: USER.id, number, status: "rascunho", created_at: new Date(Date.now() + ++n).toISOString(), share_path: null, shared_at: null, sent_at: null, decided_at: null, ...q };
    db.quotes.push(row);
  }
  items.forEach((it, i) => db.quote_items.push({ id: crypto.randomUUID(), user_id: USER.id, quote_id: row.id, position: i, ...it }));
  const sum = db.quote_items.filter((i) => i.quote_id === row.id).reduce((a, i) => a + i.line_total, 0);
  if (Math.abs(sum - row.subtotal) > 0.005) {
    if (!id) { db.quotes = db.quotes.filter((r) => r !== row); db.quote_items = db.quote_items.filter((i) => i.quote_id !== row.id); }
    return bad("Os totais do orçamento não fecham com a soma dos itens");
  }
  return send(req, res, 200, row.id);
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const p = url.pathname;
  const q = url.searchParams;
  if (req.method === "OPTIONS") { res.writeHead(204, cors(req)); return res.end(); }
  if (process.env.MOCK_LOG) console.log(req.method, p + url.search.slice(0, 80));

  if (p.startsWith("/storage/v1/")) return storage(req, res, p);

  if (p === "/auth/v1/token") {
    const b = await readBody(req);
    if (req.url.includes("grant_type=pkce")) return send(req, res, 200, session());
    if (b.password !== PASSWORD) return send(req, res, 400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
    return send(req, res, 200, session());
  }
  if (p === "/auth/v1/verify") {
    const b = await readBody(req);
    if (b && b.token_hash === "tokenvalido123456") return send(req, res, 200, session());
    return send(req, res, 403, { code: 403, error_code: "otp_expired", msg: "Email link is invalid or has expired" });
  }
  if (p === "/auth/v1/recover") return send(req, res, 200, {});
  if (p === "/auth/v1/user" && req.method === "PUT") { const b = await readBody(req); if (b && b.password) PASSWORD = b.password; return send(req, res, 200, USER); }
  if (p === "/auth/v1/user") return /Bearer .+\..+\./.test(req.headers.authorization || "") ? send(req, res, 200, USER) : send(req, res, 401, { code: 401, msg: "no token" });
  if (p === "/auth/v1/logout") return send(req, res, 204);
  if (p === "/rest/v1/rpc/save_quote") return saveQuoteRpc(req, res);
  const rpcName = /^\/rest\/v1\/rpc\/(\w+)$/.exec(p)?.[1];
  if (rpcName && stage7.names.includes(rpcName)) return rpcResponse(res, req, stage7.rpc(rpcName, await readBody(req)));
  if (rpcName && STAGE6_RPC.includes(rpcName)) return rpcResponse(res, req, stage6.rpc(rpcName, await readBody(req)));
  if (rpcName && STAGE5_RPC.includes(rpcName)) {
    if (FEATURE_OF_RPC[rpcName] && !stage6.hasFeature(FEATURE_OF_RPC[rpcName])) { await readBody(req); return rpcResponse(res, req, stage6.featureErr(FEATURE_OF_RPC[rpcName])); }
    return rpcResponse(res, req, stage5.rpc(rpcName, await readBody(req)));
  }
  // Só para os testes: volta o assistente de primeiro acesso ao estado "pendente".
  // Só para os testes: simula a passagem do tempo (prazo vencido) sem esperar dias.
  if (p === "/__set_order_due") { const b = await readBody(req); const o = db.orders.find((r) => r.number === b.number); if (o) o.due_date = b.due; return send(req, res, 200, {}); }
  if (p === "/__set_admin") { const b = await readBody(req); stage7.state.admin = Boolean(b && b.admin); return send(req, res, 200, {}); }
  if (p === "/__reset_onboarding") { db.profiles.forEach((r) => { r.onboarding_done_at = null; }); return send(req, res, 200, {}); }

  const t = /^\/rest\/v1\/(\w+)$/.exec(p)?.[1];
  if (t === "latest_pricings") {
    const seen = new Set();
    db.latest_pricings = [...db.pricings].sort((a, b) => b.created_at.localeCompare(a.created_at)).filter((r) => !seen.has(r.product_id) && seen.add(r.product_id));
  }
  if (!t || !(db[t] || t === "latest_pricings")) return send(req, res, 404, { message: "not found" });

  const audit = (action, row) => {
    if (!AUDITED.includes(t)) return;
    const { input, result, ...slim } = row;
    db.audit_log.push({ id: ++n, action, entity: t, entity_id: row.id, changes: slim, created_at: new Date(Date.now() + n).toISOString() });
  };
  const pref = req.headers.prefer || "";
  const single = (req.headers.accept || "").includes("pgrst.object");

  if (req.method === "GET" || req.method === "HEAD") {
    let rows = filter(db[t], q);
    if (t === "subscriptions") rows = rows.map((r) => ({ ...r, plan: { name: db.plans.find((pl) => pl.id === r.plan_id)?.name } }));
    if (t === "billing_checkouts") rows = rows.map((r) => ({ ...r, plan: db.plans.find((pl) => pl.id === r.plan_id) }));
    if (q.get("order")) rows = sortRows(rows, q.get("order"));
    if (q.get("limit")) rows = rows.slice(0, Number(q.get("limit")));
    if (req.method === "HEAD") return send(req, res, 200, undefined, { "content-range": `*/${rows.length}` });
    if (single) return rows.length === 1 ? send(req, res, 200, rows[0]) : rows.length === 0 && t === "cost_settings" ? send(req, res, 200, null) : send(req, res, 406, { code: "PGRST116", message: "no rows" });
    return send(req, res, 200, rows);
  }
  if (req.method === "POST") {
    const body = await readBody(req);
    const items = Array.isArray(body) ? body : [body];
    if (pref.includes("merge-duplicates")) {
      const prev = db[t].find((r) => r.user_id === items[0].user_id);
      db[t] = db[t].filter((r) => r.user_id !== items[0].user_id);
      db[t].push({ ...(prev ? {} : DEFAULTS[t] || {}), ...(prev || {}), ...items[0] });
      return send(req, res, 201);
    }
    for (const it of items) { const bad = stage5.beforeInsert(t, it); if (bad) return send(req, res, bad.status, bad.body); }
    if (["filament_spools", "stock_movements", "production_jobs", "job_reservations"].includes(t)) return send(req, res, 403, { code: "42501", message: "new row violates row-level security policy" });
    if (LIMITS[t] && db[t].length >= LIMITS[t]) return send(req, res, 400, { code: "P0001", message: `Limite do plano atingido (max_${t})` });
    const created = items.map((it) => ({ ...(DEFAULTS[t] || {}), id: crypto.randomUUID(), user_id: USER.id, is_active: true, created_at: new Date(Date.now() + ++n).toISOString(), ...it }));
    for (const it of created) { db[t].push(it); audit("insert", it); stage5.afterInsert(t, it); }
    if (pref.includes("return=representation")) return send(req, res, 201, single ? created[0] : created);
    return send(req, res, 201);
  }
  if (req.method === "PATCH") {
    const body = await readBody(req);
    const hit = filter(db[t], q);
    if (t === "quotes") {
      const NEXT = { rascunho: ["enviado", "aprovado", "recusado"], enviado: ["aprovado", "recusado", "rascunho"], recusado: ["rascunho"], expirado: ["rascunho"], aprovado: [] };
      const META = ["share_path", "shared_at", "sent_at", "decided_at", "status"];
      for (const r of hit) {
        if (body.status && body.status !== r.status && !NEXT[r.status].includes(body.status)) return send(req, res, 400, { code: "P0001", message: `Mudança de status não permitida (${r.status} -> ${body.status})` });
        if (r.status !== "rascunho" && (!body.status || body.status === r.status) && Object.keys(body).some((k) => !META.includes(k) && body[k] !== r[k])) return send(req, res, 400, { code: "P0001", message: "Orçamento enviado ou decidido não pode ser alterado. Duplique-o para fazer mudanças." });
      }
    }
    for (const r of hit) { const bad = stage5.beforePatch(t, r, body); if (bad) return send(req, res, bad.status, bad.body); }
    if (["stock_movements", "production_jobs", "job_reservations"].includes(t)) return send(req, res, 204);
    hit.forEach((r) => { Object.assign(r, body); stage5.afterPatch(t, r); });
    if (pref.includes("return=representation")) return send(req, res, 200, single ? hit[0] : hit);
    return send(req, res, 204);
  }
  if (req.method === "DELETE") {
    const del = new Set(filter(db[t], q));
    for (const r of del) { const bad = stage5.beforeDelete(t, r); if (bad) return send(req, res, bad.status, bad.body); }
    if (["stock_movements", "order_payments", "filament_spools", "production_jobs", "job_reservations"].includes(t)) return send(req, res, 204);
    del.forEach((r) => audit("delete", r));
    db[t] = db[t].filter((r) => !del.has(r));
    const ids = new Set([...del].map((d) => d.id));
    // Cascatas equivalentes às do banco real
    if (t === "products") {
      db.pricings = db.pricings.filter((r) => !ids.has(r.product_id));
      db.quote_items.forEach((r) => { if (ids.has(r.product_id)) r.product_id = null; });
      db.order_items.forEach((r) => { if (ids.has(r.product_id)) r.product_id = null; });
    }
    if (t === "pricings") db.products.forEach((r) => { if (ids.has(r.pricing_id)) r.pricing_id = null; });
    if (t === "customers") db.quotes.forEach((r) => { if (ids.has(r.customer_id)) r.customer_id = null; });
    if (t === "quotes") { db.quote_items = db.quote_items.filter((r) => !ids.has(r.quote_id)); db.orders.forEach((r) => { if (ids.has(r.quote_id)) r.quote_id = null; }); }
    if (t === "orders") {
      const jobIds = new Set(db.production_jobs.filter((j) => ids.has(j.order_id)).map((j) => j.id));
      db.order_items = db.order_items.filter((r) => !ids.has(r.order_id));
      db.order_payments = db.order_payments.filter((r) => !ids.has(r.order_id));
      db.production_jobs = db.production_jobs.filter((r) => !ids.has(r.order_id));
      db.job_reservations = db.job_reservations.filter((r) => !jobIds.has(r.job_id));
    }
    if (t === "imported_models") {
      const gone = new Set(db.print_profiles.filter((r) => ids.has(r.model_id)).map((r) => r.id));
      db.print_profiles = db.print_profiles.filter((r) => !ids.has(r.model_id));
      db.products.forEach((r) => { if (ids.has(r.model_id)) r.model_id = null; });
      db.pricings.forEach((r) => { if (gone.has(r.print_profile_id)) r.print_profile_id = null; });
    }
    if (t === "print_profiles") db.pricings.forEach((r) => { if (ids.has(r.print_profile_id)) r.print_profile_id = null; });
    return send(req, res, 204);
  }
  send(req, res, 405, {});
}).listen(Number(process.env.MOCK_PORT || 54399));
