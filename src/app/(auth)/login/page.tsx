import type { Metadata } from "next";
import { AuthForm } from "@/features/auth/auth-form";
import { login } from "@/features/auth/actions";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  return (
    <>
      <h2 className="mb-5 text-xl font-semibold">Entrar</h2>
      {erro === "link" && (
        <p role="alert" className="mb-4 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
          O link de confirmação é inválido ou expirou. Entre com sua senha ou crie a conta novamente.
        </p>
      )}
      <AuthForm mode="login" action={login} />
    </>
  );
}
