import type { Metadata } from "next";
import { AuthForm } from "@/features/auth/auth-form";
import { signUp } from "@/features/auth/actions";

export const metadata: Metadata = { title: "Criar conta" };

export default function SignUpPage() {
  return (
    <>
      <h2 className="mb-5 text-xl font-semibold">Criar conta</h2>
      <AuthForm mode="signup" action={signUp} />
    </>
  );
}
