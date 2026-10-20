import { z } from "zod";

const supabaseSchema = z.object({
  url: z.url(),
  // Chave pública (anon JWT ou "sb_publishable_…"). Nunca a service_role.
  anonKey: z.string().min(20),
});

export const REQUIRED_PUBLIC_ENV = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"] as const;

/** Configuração do Supabase ou `null` se ausente/inválida. Nunca devolve valores em mensagens de erro. */
export function getSupabaseEnv() {
  const parsed = supabaseSchema.safeParse({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  return parsed.success ? parsed.data : null;
}

/** Nomes (apenas nomes) das variáveis ausentes ou inválidas. */
export function invalidEnvVars(): string[] {
  const urlOk = supabaseSchema.shape.url.safeParse(process.env.NEXT_PUBLIC_SUPABASE_URL).success;
  const keyOk = supabaseSchema.shape.anonKey.safeParse(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY).success;
  return [!urlOk && REQUIRED_PUBLIC_ENV[0], !keyOk && REQUIRED_PUBLIC_ENV[1]].filter(
    (v): v is (typeof REQUIRED_PUBLIC_ENV)[number] => Boolean(v),
  );
}
