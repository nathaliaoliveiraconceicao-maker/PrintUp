import { createAdminClient } from "@/lib/supabase/admin";

export type EventKind = "importacao" | "pdf" | "pagamento" | "webhook" | "seguranca" | "sistema";

/** Só ids, códigos e números: nada de texto livre do usuário, e-mails, tokens ou payloads. */
const SAFE_META = /^[A-Za-z0-9_:.\-]{0,80}$/;
export function sanitizeMeta(meta: Record<string, unknown>): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(meta).slice(0, 10)) {
    if (!/^[a-z_]{1,30}$/.test(k)) continue;
    if (typeof v === "number" || typeof v === "boolean") out[k] = v;
    else if (typeof v === "string" && SAFE_META.test(v)) out[k] = v;
  }
  return out;
}

/**
 * Registra um evento operacional para o monitoramento do superadmin. Melhor esforço: NUNCA lança erro nem
 * atrapalha o fluxo do cliente. Sem a chave de serviço configurada, simplesmente não grava.
 */
export async function logEvent(kind: EventKind, severity: "info" | "aviso" | "erro", message: string, meta: Record<string, unknown> = {}, userId?: string): Promise<void> {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;
    await createAdminClient().from("app_events").insert({ kind, severity, message: message.slice(0, 300), user_id: userId ?? null, meta: sanitizeMeta(meta) });
  } catch {
    // monitoramento nunca derruba a requisição
  }
}
