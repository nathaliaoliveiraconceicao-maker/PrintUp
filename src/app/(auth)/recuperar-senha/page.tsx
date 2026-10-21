import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/features/auth/recovery-forms";

export const metadata: Metadata = { title: "Recuperar senha" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h2 className="mb-2 text-xl font-semibold">Recuperar senha</h2>
      <p className="mb-5 text-sm text-muted">Informe o e-mail da sua conta e enviaremos um link para criar uma nova senha.</p>
      <ForgotPasswordForm />
    </>
  );
}
