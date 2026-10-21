import type { Metadata } from "next";
import { ResetPasswordForm } from "@/features/auth/recovery-forms";

export const metadata: Metadata = { title: "Nova senha" };

export default function ResetPasswordPage() {
  return (
    <>
      <h2 className="mb-2 text-xl font-semibold">Criar nova senha</h2>
      <p className="mb-5 text-sm text-muted">Escolha uma senha nova para a sua conta.</p>
      <ResetPasswordForm />
    </>
  );
}
