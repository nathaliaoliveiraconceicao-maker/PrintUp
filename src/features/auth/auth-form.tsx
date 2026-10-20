"use client";

import Link from "next/link";
import { Field, Input } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/lib/use-action-form";
import type { AuthState } from "./actions";

export function AuthForm({
  mode,
  action,
}: {
  mode: "login" | "signup";
  action: (s: AuthState, f: FormData) => Promise<AuthState>;
}) {
  const { state, onSubmit, pending } = useActionForm(action, {} as AuthState);
  const signup = mode === "signup";
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {signup && (
        <Field label="Seu nome">
          <Input name="fullName" autoComplete="name" required />
        </Field>
      )}
      <Field label="E-mail">
        <Input name="email" type="email" autoComplete="email" inputMode="email" required />
      </Field>
      <Field label="Senha" hint={signup ? "Mínimo de 8 caracteres." : undefined}>
        <Input name="password" type="password" autoComplete={signup ? "new-password" : "current-password"} minLength={8} required />
      </Field>
      <FormMessage error={state.error} ok={state.ok} />
      <SubmitButton pending={pending} className="w-full">{signup ? "Criar conta e testar grátis" : "Entrar"}</SubmitButton>
      <p className="text-center text-sm text-muted">
        {signup ? (
          <>Já tem conta? <Link href="/login" className="font-medium text-accent-strong underline">Entrar</Link></>
        ) : (
          <>Primeira vez? <Link href="/cadastro" className="font-medium text-accent-strong underline">Criar conta</Link></>
        )}
      </p>
    </form>
  );
}
