import { z } from "zod";
import { decimal as baseDecimal, checkbox, optionalText } from "@/lib/forms";
import { DEFAULT_WEIGHTS } from "./score";
import { hostAllowed, type AffiliateConfig } from "./affiliate";

/** Campo numérico que, se ausente do formulário, usa o valor padrão (`empty`). */
const decimal = (o: Parameters<typeof baseDecimal>[0] = {}) => z.preprocess((v) => (v === undefined ? "" : v), baseDecimal(o));

const HOST = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/;

/** Uma linha por host (sem https://, sem caminho). */
export function parseHosts(text: string): string[] | null {
  const hosts = text.split(/[\s,]+/).map((h) => h.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "")).filter(Boolean);
  if (hosts.length === 0 || hosts.length > 20 || hosts.some((h) => !HOST.test(h))) return null;
  return [...new Set(hosts)];
}

/** "aff=MEUID" por linha → parâmetros fixos do link de afiliado. */
export function parseParams(text: string): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const line of text.split("\n").map((l) => l.trim()).filter(Boolean)) {
    const m = /^([A-Za-z0-9_.-]{1,40})=(.{1,200})$/.exec(line);
    if (!m) return null;
    out[m[1]] = m[2].trim();
  }
  return Object.keys(out).length <= 10 ? out : null;
}

export const storeSchema = z
  .object({
    code: z.string().trim().regex(/^[a-z0-9_-]{2,30}$/, "Use de 2 a 30 letras minúsculas, números, - ou _."),
    name: z.string().trim().min(1, "Informe o nome.").max(60),
    kind: z.enum(["afiliado", "feed", "manual", "simulado"]),
    hosts: z.string(),
    reliability: decimal({ min: 0, max: 100, empty: 60 }),
    params: z.string().default(""),
    required: z.string().default(""),
    template: optionalText(400),
    disclosure: z.string().trim().max(300).default(""),
    isActive: checkbox,
  })
  .superRefine((v, ctx) => {
    const hosts = parseHosts(v.hosts);
    if (!hosts) ctx.addIssue({ code: "custom", path: ["hosts"], message: "Informe os domínios permitidos (um por linha, ex.: shopee.com.br)." });
    if (parseParams(v.params) === null) ctx.addIssue({ code: "custom", path: ["params"], message: "Use uma linha por parâmetro, no formato nome=valor." });
    if (v.template) {
      if (!v.template.includes("{url}") || !/^https:\/\//.test(v.template)) ctx.addIssue({ code: "custom", path: ["template"], message: "O modelo precisa começar com https:// e conter {url}." });
      else if (hosts) {
        try { if (!hostAllowed(new URL(v.template.replace("{url}", "x")).hostname, hosts)) ctx.addIssue({ code: "custom", path: ["template"], message: "O domínio do rastreador também precisa estar na lista de domínios permitidos." }); }
        catch { ctx.addIssue({ code: "custom", path: ["template"], message: "Modelo de link inválido." }); }
      }
    }
  })
  .transform((v) => ({
    code: v.code, name: v.name, kind: v.kind, allowed_hosts: parseHosts(v.hosts) as string[], reliability: Math.round(v.reliability),
    affiliate_config: { params: parseParams(v.params) ?? {}, requiredParams: v.required.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean).slice(0, 10), ...(v.template ? { template: v.template } : {}) } satisfies AffiliateConfig,
    disclosure: v.disclosure || undefined, is_active: v.isActive,
  }));

const SECRET_KEY = /(secret|token|senha|password|passwd|apikey|api_key|authorization|credential)/i;
export function configHasSecret(o: unknown): boolean {
  if (Array.isArray(o)) return o.some(configHasSecret);
  if (o && typeof o === "object") return Object.entries(o).some(([k, v]) => SECRET_KEY.test(k) || configHasSecret(v));
  return false;
}

export const sourceSchema = z.object({
  storeId: z.string().uuid("Escolha a loja."),
  connector: z.enum(["feed_manual", "shopee", "mercadolivre", "simulado"]),
  name: z.string().trim().min(1, "Informe o nome.").max(80),
  config: z.string().default("{}"),
  frequencyMinutes: decimal({ min: 60, max: 10080, empty: 1440 }),
  isActive: checkbox,
  confirmUnverified: checkbox,
}).transform((v, ctx) => {
  let config: Record<string, unknown> = {};
  try {
    const j = JSON.parse(v.config.trim() || "{}") as unknown;
    if (!j || typeof j !== "object" || Array.isArray(j) || JSON.stringify(j).length > 5000) throw new Error("x");
    config = j as Record<string, unknown>;
  } catch { ctx.addIssue({ code: "custom", path: ["config"], message: "A configuração precisa ser um JSON válido (objeto, até 5 KB)." }); return z.NEVER; }
  if (configHasSecret(config)) { ctx.addIssue({ code: "custom", path: ["config"], message: "Não coloque senhas, tokens ou chaves aqui: elas ficam só nas variáveis de ambiente do servidor." }); return z.NEVER; }
  return { store_id: v.storeId, connector: v.connector, name: v.name, config, frequency_minutes: Math.round(v.frequencyMinutes), is_active: v.isActive, confirmUnverified: v.confirmUnverified };
});

export const couponSchema = z.object({
  storeId: z.string().uuid("Escolha a loja."),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{2,31}$/, "Use de 3 a 32 letras, números, - ou _."),
  kind: z.enum(["percent", "fixed"]),
  value: decimal({ min: 0.01, max: 100000 }),
  minPurchase: decimal({ min: 0, max: 1_000_000 }),
  maxDiscount: decimal({ min: 0, max: 1_000_000 }),
  validUntil: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.").optional()),
  source: z.string().trim().min(1, "Diga de onde veio o cupom (loja, parceiro, newsletter…).").max(80),
}).superRefine((v, ctx) => { if (v.kind === "percent" && v.value >= 100) ctx.addIssue({ code: "custom", path: ["value"], message: "Percentual deve ser menor que 100." }); });

export const settingsSchema = z.object({
  autoPublish: checkbox,
  minScorePublish: decimal({ min: 0, max: 100, empty: 75 }),
  minScoreReview: decimal({ min: 0, max: 100, empty: 45 }),
  expireAfterHours: decimal({ min: 6, max: 720, empty: 72 }),
  historyWindowDays: decimal({ min: 7, max: 365, empty: 90 }),
  w_discount: decimal({ min: 0, max: 100, empty: DEFAULT_WEIGHTS.discount }), w_history: decimal({ min: 0, max: 100, empty: DEFAULT_WEIGHTS.history }), w_relevance: decimal({ min: 0, max: 100, empty: DEFAULT_WEIGHTS.relevance }),
  w_availability: decimal({ min: 0, max: 100, empty: DEFAULT_WEIGHTS.availability }), w_store: decimal({ min: 0, max: 100, empty: DEFAULT_WEIGHTS.store }), w_quality: decimal({ min: 0, max: 100, empty: DEFAULT_WEIGHTS.quality }),
  w_coupon: decimal({ min: 0, max: 100, empty: DEFAULT_WEIGHTS.coupon }), w_freshness: decimal({ min: 0, max: 100, empty: DEFAULT_WEIGHTS.freshness }),
}).superRefine((v, ctx) => {
  if (v.minScoreReview > v.minScorePublish) ctx.addIssue({ code: "custom", path: ["minScoreReview"], message: "A nota mínima de revisão não pode ser maior que a de publicação." });
  if (v.w_discount + v.w_history + v.w_relevance + v.w_availability + v.w_store + v.w_quality + v.w_coupon + v.w_freshness <= 0) ctx.addIssue({ code: "custom", path: ["w_discount"], message: "Pelo menos um peso precisa ser maior que zero." });
});

export const conversionSchema = z.object({
  storeId: z.string().uuid("Escolha a loja."),
  reportedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data."),
  orders: decimal({ min: 0, max: 1_000_000 }),
  commission: decimal({ min: 0, max: 10_000_000 }),
  status: z.enum(["informada", "confirmada"]),
  note: optionalText(200),
});
