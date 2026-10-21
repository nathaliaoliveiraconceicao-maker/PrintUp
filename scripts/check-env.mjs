// Confere as variáveis de ambiente do PrintUp sem imprimir valores. Uso: npm run check:env
import { existsSync, readFileSync } from "node:fs";

const file = [".env.local", ".env"].find(existsSync);
const fromFile = {};
if (file) {
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) fromFile[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const get = (k) => process.env[k] || fromFile[k] || "";

const checks = [
  ["NEXT_PUBLIC_SUPABASE_URL", "obrigatória", (v) => /^https?:\/\/.+/.test(v)],
  ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "obrigatória", (v) => v.length >= 20],
  ["SUPABASE_SERVICE_ROLE_KEY", "só para pagamentos/webhooks (servidor)", (v) => v.length >= 20],
  ["BILLING_GATEWAY", "opcional: 'simulado' só em desenvolvimento", (v) => v === "simulado"],
  ["BILLING_WEBHOOK_SECRET", "opcional: segredo do webhook (≥ 16 caracteres)", (v) => v.length >= 16],
];

console.log(file ? `Lendo ${file}` : "Nenhum .env.local encontrado (usando apenas o ambiente).");
let failed = false;
for (const [name, note, ok] of checks) {
  const v = get(name);
  const required = note === "obrigatória";
  const status = !v ? (required ? "FALTA" : "ausente (ok por enquanto)") : ok(v) ? "ok" : "FORMATO INVÁLIDO";
  if (required && status !== "ok") failed = true;
  console.log(`  ${status === "ok" ? "✓" : required ? "✗" : "·"} ${name} — ${status} [${note}]`);
}
process.exit(failed ? 1 : 0);
