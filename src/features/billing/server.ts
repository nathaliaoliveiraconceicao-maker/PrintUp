import type { SupabaseClient } from "@supabase/supabase-js";
import type { EntitlementRow } from "@/lib/billing/state";

export interface PlanRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price_cents: number;
  price_yearly_cents: number | null;
  trial_days: number;
  limits: Record<string, number | null>;
  features: Record<string, boolean>;
  highlight: boolean;
  sort_order: number;
  is_public: boolean;
  is_active: boolean;
}
export const PLAN_COLUMNS = "id, code, name, description, price_cents, price_yearly_cents, trial_days, limits, features, highlight, sort_order, is_public, is_active";

/** Planos oferecidos (ativos e públicos), do banco: preços, limites e recursos nunca ficam no código. */
export async function loadPublicPlans(supabase: SupabaseClient): Promise<PlanRow[]> {
  const { data } = await supabase.from("plans").select(PLAN_COLUMNS).eq("is_active", true).eq("is_public", true).order("sort_order");
  return (data ?? []) as PlanRow[];
}

export async function loadEntitlements(supabase: SupabaseClient): Promise<EntitlementRow | null> {
  const { data } = await supabase.rpc("current_entitlements");
  return ((data as EntitlementRow[] | null) ?? [])[0] ?? null;
}

export interface ChargeRow {
  id: string;
  amount_cents: number;
  status: "pendente" | "recebida" | "falhou" | "vencida" | "estornada" | "cancelada";
  method: "cartao" | "pix" | "boleto" | null;
  due_date: string | null;
  paid_at: string | null;
  invoice_url: string | null;
  created_at: string;
}

export interface Usage {
  products: number;
  printers: number;
  filaments: number;
  importsMonth: number;
  pdfMonth: number;
  storageBytes: number;
}

/** Consumo atual de cada limite do plano (contagens reais do próprio usuário, via RLS). */
export async function loadUsage(supabase: SupabaseClient): Promise<Usage> {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const count = (t: string) => supabase.from(t).select("id", { count: "exact", head: true });
  const [pr, pt, fl, im, pdf, st] = await Promise.all([
    count("products"),
    count("printers"),
    count("filaments"),
    count("imported_models").gte("created_at", monthStart.toISOString()),
    count("usage_events").eq("metric", "pdf_month").gte("period_start", monthStart.toISOString().slice(0, 10)),
    supabase.rpc("storage_used_bytes"),
  ]);
  return {
    products: pr.count ?? 0,
    printers: pt.count ?? 0,
    filaments: fl.count ?? 0,
    importsMonth: im.count ?? 0,
    pdfMonth: pdf.count ?? 0,
    storageBytes: Number(st.data ?? 0),
  };
}

export async function loadCharges(supabase: SupabaseClient): Promise<ChargeRow[]> {
  const { data } = await supabase
    .from("billing_charges")
    .select("id, amount_cents, status, method, due_date, paid_at, invoice_url, created_at")
    .order("created_at", { ascending: false })
    .limit(24);
  return (data ?? []) as ChargeRow[];
}
