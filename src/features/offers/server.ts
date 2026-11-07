import { createAdminClient } from "@/lib/supabase/admin";
import { SupabaseRepo } from "./repo-supabase";

/** Repositório com a chave de serviço. SÓ servidor: cron, importação e ações do superadmin já autenticado. */
export const offersRepo = () => new SupabaseRepo(createAdminClient());

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}
