// Dublê LOCAL do Supabase (Auth + PostgREST mínimo) usado só pelos testes E2E do PrintUp.
// NÃO é o Supabase real: não valida RLS nem triggers (isso é coberto por `npm run test:db`).
// Credenciais de teste abaixo são fictícias e só existem neste arquivo.
const http = require("http");
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const USER = { id: "11111111-1111-1111-1111-111111111111", aud: "authenticated", role: "authenticated", email: "teste@printup.local", app_metadata: {}, user_metadata: { full_name: "Teste Mock" }, created_at: new Date().toISOString() };
const jwt = () => `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: USER.id, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
const db = { printers: [], filaments: [], cost_settings: [], products: [], pricings: [], audit_log: [] };
const LIMITS = { printers: 1, filaments: 5, products: 10 };
let n = 0;
const send = (res, code, body, headers = {}) => { res.writeHead(code, { "content-type": "application/json", ...headers }); res.end(body === undefined ? "" : JSON.stringify(body)); };
const readBody = (req) => new Promise((r) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => r(d ? JSON.parse(d) : null)); });
const filter = (rows, q) => { for (const [k, v] of q) { const m = /^eq\.(.*)$/.exec(v); if (m && !["select", "order"].includes(k)) rows = rows.filter((r) => String(r[k]) === m[1]); } return rows; };

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x"); const p = url.pathname; const q = url.searchParams;
  console.log(req.method, p + url.search.slice(0, 60));
  if (p === "/auth/v1/token") {
    const b = await readBody(req);
    if (b.password !== "senha-de-teste-123") return send(res, 400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
    return send(res, 200, { access_token: jwt(), token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: "r" + ++n, user: USER });
  }
  if (p === "/auth/v1/user") return /Bearer .+\..+\./.test(req.headers.authorization || "") ? send(res, 200, USER) : send(res, 401, { code: 401, msg: "no token" });
  if (p === "/auth/v1/logout") return send(res, 204);
  if (p === "/rest/v1/rpc/current_entitlements") return send(res, 200, [{ plan_code: "trial", status: "trialing", limits: { max_printers: 1, max_filaments: 5 }, features: {}, active: true }]);
  if (p === "/rest/v1/subscriptions") return send(res, 200, { status: "trialing", trial_ends_at: new Date(Date.now() + 13 * 864e5).toISOString(), plan: { name: "Teste grátis" } });
  if (p === "/rest/v1/profiles") return send(res, 200, { full_name: "Teste Mock" });
  let t = /^\/rest\/v1\/(\w+)$/.exec(p)?.[1];
  if (t === "latest_pricings") { const seen = new Set(); db.latest_pricings = [...db.pricings].sort((a, b) => b.created_at.localeCompare(a.created_at)).filter((r) => !seen.has(r.product_id) && seen.add(r.product_id)); }
  if (!t || !(db[t] || t === "latest_pricings")) return send(res, 404, { message: "not found" });
  const audit = (action, row) => { if (["printers","filaments","products","pricings"].includes(t)) { const { input, result, ...slim } = row; db.audit_log.push({ id: ++n, action, entity: t, entity_id: row.id, changes: slim, created_at: new Date(Date.now() + n).toISOString() }); } };
  const pref = req.headers.prefer || ""; const single = (req.headers.accept || "").includes("pgrst.object");
  if (req.method === "GET" || req.method === "HEAD") {
    let rows = filter(db[t], q);
    const ord = q.get("order"); if (ord) { const [col, dir] = ord.split("."); rows = [...rows].sort((a, b) => String(a[col]).localeCompare(String(b[col])) * (dir === "desc" ? -1 : 1)); }
    if (q.get("limit")) rows = rows.slice(0, Number(q.get("limit")));
    if (req.method === "HEAD") return send(res, 200, undefined, { "content-range": `*/${rows.length}` });
    if (single) return rows.length === 1 ? send(res, 200, rows[0]) : rows.length === 0 && t === "cost_settings" ? send(res, 200, null) : send(res, 406, { code: "PGRST116", message: "no rows" });
    return send(res, 200, rows);
  }
  if (req.method === "POST") {
    const body = await readBody(req); const items = Array.isArray(body) ? body : [body];
    if (pref.includes("merge-duplicates")) { db[t] = db[t].filter((r) => r.user_id !== items[0].user_id); db[t].push(...items); return send(res, 201); }
    if (LIMITS[t] && db[t].length >= LIMITS[t]) return send(res, 400, { code: "P0001", message: `Limite do plano atingido (max_${t})` });
    const created = items.map((it) => ({ id: require("crypto").randomUUID(), user_id: USER.id, is_active: true, created_at: new Date(Date.now() + n).toISOString(), ...it }));
    for (const it of created) { db[t].push(it); audit("insert", it); }
    if (pref.includes("return=representation")) return send(res, 201, single ? created[0] : created);
    return send(res, 201);
  }
  if (req.method === "PATCH") { const body = await readBody(req); filter(db[t], q).forEach((r) => Object.assign(r, body)); return send(res, 204); }
  if (req.method === "DELETE") { const del = new Set(filter(db[t], q)); del.forEach((r) => audit("delete", r)); db[t] = db[t].filter((r) => !del.has(r)); if (t === "products") db.pricings = db.pricings.filter((r) => ![...del].some((d) => d.id === r.product_id)); return send(res, 204); }
  send(res, 405, {});
}).listen(Number(process.env.MOCK_PORT || 54399));
