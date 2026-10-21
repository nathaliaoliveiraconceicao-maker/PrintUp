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
const TABLES = ["printers", "filaments", "cost_settings", "products", "pricings", "audit_log", "imported_models", "print_profiles"];
const db = Object.fromEntries(TABLES.map((t) => [t, []]));
const LIMITS = { printers: 1, filaments: 5, products: 10 };
const AUDITED = ["printers", "filaments", "products", "pricings", "imported_models"];
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

async function storage(req, res, p) {
  if (p.startsWith("/storage/v1/object/sign/model-files/") && req.method === "GET") {
    const path = decodeURIComponent(p.slice("/storage/v1/object/sign/model-files/".length));
    const o = objects.get(path);
    if (!o) return send(req, res, 404, { message: "not found" });
    res.writeHead(200, { "content-type": o.contentType, ...cors(req) });
    return res.end(o.bytes);
  }
  if (p === "/storage/v1/object/sign/model-files" && req.method === "POST") {
    const b = await readBody(req);
    return send(req, res, 200, b.paths.map((path) => objects.has(path)
      ? { error: null, path, signedURL: `/object/sign/model-files/${encodeURIComponent(path).replace(/%2F/g, "/")}?token=t` }
      : { error: "Object not found", path, signedURL: null }));
  }
  if (p === "/storage/v1/object/list/model-files" && req.method === "POST") {
    const b = await readBody(req);
    const prefix = b.prefix || "";
    const out = [...objects.entries()]
      .filter(([path]) => path.slice(0, path.lastIndexOf("/")) === prefix && (!b.search || path.includes(b.search)))
      .map(([path, o]) => ({ name: path.slice(path.lastIndexOf("/") + 1), id: path, metadata: { size: o.bytes.length, mimetype: o.contentType } }));
    return send(req, res, 200, out);
  }
  if (p === "/storage/v1/object/model-files" && req.method === "DELETE") {
    const b = await readBody(req);
    const removed = [];
    for (const path of b.prefixes || []) if (objects.delete(path)) removed.push({ name: path });
    return send(req, res, 200, removed);
  }
  if (p.startsWith("/storage/v1/object/model-files/") && (req.method === "POST" || req.method === "PUT")) {
    const path = decodeURIComponent(p.slice("/storage/v1/object/model-files/".length));
    if (!path.startsWith(USER.id + "/")) return send(req, res, 403, { message: "new row violates row-level security policy", statusCode: "403" });
    const bytes = await readRaw(req);
    if (objects.has(path)) return send(req, res, 409, { message: "The resource already exists" });
    objects.set(path, { bytes, contentType: req.headers["content-type"] || "application/octet-stream" });
    return send(req, res, 200, { Key: `model-files/${path}`, Id: crypto.randomUUID() });
  }
  return send(req, res, 404, { message: "storage: rota não suportada no dublê" });
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
  if (p === "/auth/v1/recover") return send(req, res, 200, {});
  if (p === "/auth/v1/user" && req.method === "PUT") { const b = await readBody(req); if (b && b.password) PASSWORD = b.password; return send(req, res, 200, USER); }
  if (p === "/auth/v1/user") return /Bearer .+\..+\./.test(req.headers.authorization || "") ? send(req, res, 200, USER) : send(req, res, 401, { code: 401, msg: "no token" });
  if (p === "/auth/v1/logout") return send(req, res, 204);
  if (p === "/rest/v1/rpc/current_entitlements") return send(req, res, 200, [{ plan_code: "trial", status: "trialing", limits: { max_printers: 1, max_filaments: 5 }, features: {}, active: true }]);
  if (p === "/rest/v1/subscriptions") return send(req, res, 200, { status: "trialing", trial_ends_at: new Date(Date.now() + 13 * 864e5).toISOString(), plan: { name: "Teste grátis" } });
  if (p === "/rest/v1/profiles") return send(req, res, 200, { full_name: "Teste Mock" });

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
    if (q.get("order")) rows = sortRows(rows, q.get("order"));
    if (q.get("limit")) rows = rows.slice(0, Number(q.get("limit")));
    if (req.method === "HEAD") return send(req, res, 200, undefined, { "content-range": `*/${rows.length}` });
    if (single) return rows.length === 1 ? send(req, res, 200, rows[0]) : rows.length === 0 && t === "cost_settings" ? send(req, res, 200, null) : send(req, res, 406, { code: "PGRST116", message: "no rows" });
    return send(req, res, 200, rows);
  }
  if (req.method === "POST") {
    const body = await readBody(req);
    const items = Array.isArray(body) ? body : [body];
    if (pref.includes("merge-duplicates")) { db[t] = db[t].filter((r) => r.user_id !== items[0].user_id); db[t].push(...items); return send(req, res, 201); }
    if (LIMITS[t] && db[t].length >= LIMITS[t]) return send(req, res, 400, { code: "P0001", message: `Limite do plano atingido (max_${t})` });
    const created = items.map((it) => ({ id: crypto.randomUUID(), user_id: USER.id, is_active: true, created_at: new Date(Date.now() + ++n).toISOString(), ...it }));
    for (const it of created) { db[t].push(it); audit("insert", it); }
    if (pref.includes("return=representation")) return send(req, res, 201, single ? created[0] : created);
    return send(req, res, 201);
  }
  if (req.method === "PATCH") {
    const body = await readBody(req);
    filter(db[t], q).forEach((r) => Object.assign(r, body));
    return send(req, res, 204);
  }
  if (req.method === "DELETE") {
    const del = new Set(filter(db[t], q));
    del.forEach((r) => audit("delete", r));
    db[t] = db[t].filter((r) => !del.has(r));
    const ids = new Set([...del].map((d) => d.id));
    // Cascatas equivalentes às do banco real
    if (t === "products") db.pricings = db.pricings.filter((r) => !ids.has(r.product_id));
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
