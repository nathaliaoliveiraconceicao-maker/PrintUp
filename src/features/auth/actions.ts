"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { confirmLinkSchema, forgotPasswordSchema, newPasswordSchema, safeNextPath } from "./schema";

export type AuthState = { error?: string; ok?: string };

const credentials = z.object({
  email: z.email("Informe um e-mail válido."),
  password: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres."),
});

export async function login(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = credentials.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "E-mail ou senha incorretos." };
  redirect("/");
}

export async function signUp(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = credentials
    .extend({ fullName: z.string().trim().min(2, "Informe seu nome.").max(80) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const h = await headers();
  const origin = h.get("origin") ?? `https://${h.get("host")}`;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });
  if (error) return { error: "Não foi possível criar a conta. Verifique os dados ou tente entrar." };
  if (data.session) redirect("/");
  return { ok: "Enviamos um link de confirmação para o seu e-mail." };
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/**
 * Envia o link de recuperação. A resposta é sempre a mesma, exista o e-mail ou não,
 * para não revelar quais e-mails têm conta.
 */
export async function requestPasswordReset(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = forgotPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const h = await headers();
  const origin = h.get("origin") ?? `https://${h.get("host")}`;
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${origin}/auth/callback?next=/redefinir-senha`,
  });
  return { ok: "Se existir uma conta com esse e-mail, enviamos um link para redefinir a senha. Confira também o spam." };
}

/** Define a nova senha. Só funciona com a sessão aberta pelo link de recuperação (ou já logado). */
export async function updatePassword(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = newPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "O link expirou. Peça um novo link de recuperação." };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: "Não foi possível alterar a senha. Tente outra senha ou peça um novo link." };
  redirect("/");
}

/** Confirma o e-mail (ou a recuperação de senha) quando a pessoa clica no botão da página /auth/confirm. */
export async function confirmEmailLink(formData: FormData) {
  const parsed = confirmLinkSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/login?erro=link");
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: parsed.data.token_hash, type: parsed.data.type });
  if (error) redirect("/login?erro=link");
  redirect(parsed.data.type === "recovery" ? "/redefinir-senha" : safeNextPath(parsed.data.next));
}
