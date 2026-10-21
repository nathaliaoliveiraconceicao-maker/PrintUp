import { z } from "zod";
import { checkbox, decimal, optionalText } from "@/lib/forms";
import { FEATURES } from "@/lib/billing/state";

export const LIMIT_KEYS = ["max_products", "max_printers", "max_filaments", "max_imports_month", "max_pdf_month", "max_storage_mb"] as const;
export const FEATURE_KEYS = Object.keys(FEATURES);

// ───────── Período dos indicadores (datas em horário de Brasília) ─────────
export type Period = { key: string; label: string; from: Date; to: Date };
const DAY = 86_400_000;
const isoDay = /^\d{4}-\d{2}-\d{2}$/;
const brt = (d: string) => new Date(`${d}T00:00:00-03:00`);

export function parsePeriod(params: { periodo?: string; de?: string; ate?: string }, now: Date = new Date()): Period {
  const days = ({ "7d": 7, "30d": 30, "90d": 90 } as Record<string, number>)[params.periodo ?? ""];
  if (days) return { key: params.periodo!, label: `Últimos ${days} dias`, from: new Date(now.getTime() - days * DAY), to: new Date(now.getTime() + 1000) };
  if (params.periodo === "personalizado" && params.de && params.ate && isoDay.test(params.de) && isoDay.test(params.ate)) {
    const from = brt(params.de);
    const to = new Date(brt(params.ate).getTime() + DAY); // a data final entra inteira
    if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && to > from && to.getTime() - from.getTime() <= 731 * DAY) {
      return { key: "personalizado", label: `${params.de.split("-").reverse().join("/")} a ${params.ate.split("-").reverse().join("/")}`, from, to };
    }
  }
  return { key: "30d", label: "Últimos 30 dias", from: new Date(now.getTime() - 30 * DAY), to: new Date(now.getTime() + 1000) };
}

/** Paginação: números pequenos e seguros vindos da URL. */
export function parsePage(raw: string | undefined, size = 25): { page: number; limit: number; offset: number } {
  const n = Number.parseInt(raw ?? "1", 10);
  const page = Number.isFinite(n) && n >= 1 && n <= 10_000 ? n : 1;
  return { page, limit: size, offset: (page - 1) * size };
}

// ───────── Plano ─────────
const limit = z.preprocess((v) => (typeof v === "string" ? (v.trim() === "" ? null : Number(v.replace(/\./g, "").replace(",", "."))) : v),
  z.number({ error: "Use um número inteiro ou deixe em branco (ilimitado)." }).int("Use um número inteiro.").min(0).max(999_999_999).nullable());

export const planFormSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome.").max(60),
  description: optionalText(300),
  price: decimal({ min: 0, max: 100_000 }),
  priceYearly: z.preprocess((v) => (v === undefined || (typeof v === "string" && v.trim() === "") ? null : v), decimal({ min: 0, max: 1_000_000 }).nullable()),
  sortOrder: decimal({ min: 0, max: 9999 }),
  isPublic: checkbox,
  isActive: checkbox,
  highlight: checkbox,
  max_products: limit, max_printers: limit, max_filaments: limit, max_imports_month: limit, max_pdf_month: limit, max_storage_mb: limit,
  ...Object.fromEntries(FEATURE_KEYS.map((k) => [`feat_${k}`, checkbox])),
});

const cents = (reais: number) => Math.round(reais * 100);

/** Formulário → `p_patch` da função `admin_update_plan` (o banco valida de novo). */
export function toPlanPatch(d: z.infer<typeof planFormSchema>): Record<string, unknown> {
  const raw = d as unknown as Record<string, unknown>;
  return {
    name: d.name,
    description: d.description ?? null,
    price_cents: cents(d.price),
    price_yearly_cents: d.priceYearly === null ? null : cents(d.priceYearly),
    sort_order: Math.round(d.sortOrder),
    is_public: d.isPublic, is_active: d.isActive, highlight: d.highlight,
    limits: Object.fromEntries(LIMIT_KEYS.map((k) => [k, raw[k] as number | null])),
    features: Object.fromEntries(FEATURE_KEYS.map((k) => [k, Boolean(raw[`feat_${k}`])])),
  };
}

// ───────── Cupom, cortesia, motivo, configurações ─────────
const dateTime = z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/, "Data inválida.").optional());
export const toBrtIso = (v: string | undefined): string | null => {
  if (!v) return null;
  const d = new Date(v.length === 10 ? `${v}T00:00:00-03:00` : `${v}:00-03:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

export const couponFormSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{4,32}$/, "Use 4 a 32 letras, números, - ou _."),
  description: optionalText(200),
  planCode: z.string().regex(/^[a-z0-9_]{2,40}$/, "Escolha o plano."),
  days: decimal({ min: 1, max: 365 }),
  restrictedEmail: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().toLowerCase().email("E-mail inválido.").max(120).optional()),
  maxRedemptions: z.preprocess((v) => (v === undefined || (typeof v === "string" && v.trim() === "") ? null : v), decimal({ min: 1, max: 1_000_000 }).nullable()),
  validFrom: dateTime,
  validUntil: dateTime,
});

export const courtesySchema = z.object({
  userId: z.string().uuid(),
  planCode: z.string().regex(/^[a-z0-9_]{2,40}$/, "Escolha o plano."),
  days: decimal({ min: 1, max: 365 }),
  reason: z.string().trim().min(3, "Informe o motivo.").max(200),
});
export const reasonSchema = z.object({ userId: z.string().uuid(), reason: z.string().trim().min(3, "Informe o motivo.").max(200) });

export const settingsSchema = z.object({
  billing_grace_days: decimal({ min: 0, max: 30 }),
  trial_enabled: checkbox,
  support_email: z.string().trim().max(120).refine((v) => v === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), "E-mail inválido."),
  terms_url: z.string().trim().max(300).refine((v) => v === "" || /^https:\/\/\S{3,}$/.test(v), "Use um link https válido."),
  privacy_url: z.string().trim().max(300).refine((v) => v === "" || /^https:\/\/\S{3,}$/.test(v), "Use um link https válido."),
});

export const couponCodeSchema = z.string().trim().min(1, "Informe o código.").max(40);
