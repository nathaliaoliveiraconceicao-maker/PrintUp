import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "@/lib/env";

/**
 * Cliente com a chave de SERVIÇO: ignora RLS. Só para código de servidor (webhooks, reconciliação, ações de cobrança),
 * sempre depois de autenticar o usuário e SEMPRE filtrando pelo id dele. Nunca importar em componente de navegador.
 */
export function createAdminClient() {
  if (typeof window !== "undefined") throw new Error("createAdminClient é só para o servidor.");
  const env = getSupabaseEnv();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!env || !key) throw new Error("Chave de servidor do Supabase não configurada.");
  return createSupabaseClient(env.url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
