import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logEvent } from "./log";

export type AdminContext = { supabase: Awaited<ReturnType<typeof createClient>>; userId: string };

/**
 * Confere NO SERVIDOR (token validado + papel no banco) se quem chamou é superadmin.
 * Nunca usa e-mail fixo nem dado vindo do navegador. O banco confere de novo em cada função `admin_*`.
 */
export async function currentAdmin(): Promise<AdminContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.rpc("is_superadmin");
  if (data !== true) {
    await logEvent("seguranca", "aviso", "Acesso à área administrativa negado", {}, user.id);
    return null;
  }
  return { supabase, userId: user.id };
}

/** Páginas: quem não é superadmin recebe 404 (a existência do painel não é revelada). */
export async function requireAdminPage(): Promise<AdminContext> {
  const ctx = await currentAdmin();
  if (!ctx) notFound();
  return ctx;
}

/** Para decidir se mostra o atalho "Administração": sem registrar negativa (clientes comuns são o caso normal). */
export async function isAdminQuiet(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.rpc("is_superadmin");
    return data === true;
  } catch {
    return false;
  }
}
