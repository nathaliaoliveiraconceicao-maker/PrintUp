"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { dbErrorMessage, zodToState, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { catalogShareSchema } from "./schema";

const newToken = () => randomUUID().replace(/-/g, "");

/** Cria (na primeira vez) ou atualiza as opções da vitrine compartilhável. O link só muda em `regenerateCatalogLink`. */
export async function saveCatalogShare(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = catalogShareSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodToState(parsed.error);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada. Entre novamente." };
  const v = parsed.data;

  const { data: current } = await supabase.from("catalog_shares").select("user_id").maybeSingle();
  const fields = { enabled: v.enabled, title: v.title ?? null, show_prices: v.showPrices, show_out_of_stock: v.showOutOfStock };
  const { error } = current
    ? await supabase.from("catalog_shares").update(fields).eq("user_id", user.id)
    : await supabase.from("catalog_shares").insert({ user_id: user.id, token: newToken(), ...fields });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath("/produtos/compartilhar");
  return { ok: v.enabled ? "Vitrine salva. O link está ativo." : "Vitrine salva. O link está desativado: ninguém consegue abrir." };
}

/** Gera um link novo: o anterior para de funcionar na hora (use se o link foi parar onde não devia). */
export async function regenerateCatalogLink(): Promise<FormState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada. Entre novamente." };
  const { data, error } = await supabase.from("catalog_shares").update({ token: newToken() }).eq("user_id", user.id).select("user_id");
  if (error) return { error: dbErrorMessage(error) };
  if (!data?.length) return { error: "Ative a vitrine antes de gerar um novo link." };
  revalidatePath("/produtos/compartilhar");
  return { ok: "Novo link gerado. O anterior não funciona mais." };
}
