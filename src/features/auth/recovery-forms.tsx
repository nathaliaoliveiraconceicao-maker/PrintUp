"use client";

import Link from "next/link";
import { Field, Input } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/lib/use-action-form";
import { requestPasswordReset, updatePassword, type AuthState } from "./actions";

export function ForgotPasswordForm() {
  const { state, onSubmit, pending } = useActionForm(requestPasswordReset, {} as AuthState);
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="E-mail da sua conta">
        <Input name="email" type="email" autoComplete="email" inputMode="email" required />
      </Field>
      <FormMessage error={state.error} ok={state.ok} />
      <SubmitButton pending={pending} className="w-full">Enviar link de recuperação</SubmitButton>
      <p className="text-center text-sm text-muted">
        <Link href="/login" className="font-medium text-accent-strong underline">Voltar para o login</Link>
      </p>
    </form>
  );
}

export function ResetPasswordForm() {
  const { state, onSubmit, pending } = useActionForm(updatePassword, {} as AuthState);
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Nova senha" hint="Mínimo de 8 caracteres.">
        <Input name="password" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <Field label="Repita a nova senha">
        <Input name="confirm" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <FormMessage error={state.error} />
      <SubmitButton pending={pending} className="w-full">Salvar nova senha</SubmitButton>
    </form>
  );
}
