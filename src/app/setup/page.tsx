import type { Metadata } from "next";
import { Logo } from "@/components/logo";
import { invalidEnvVars } from "@/lib/env";

export const metadata: Metadata = { title: "Configuração pendente" };
export const dynamic = "force-dynamic";

export default function SetupPage() {
  const missing = invalidEnvVars();
  return (
    <main className="mx-auto max-w-xl px-5 py-12">
      <Logo />
      <h1 className="mt-8 text-2xl font-semibold tracking-tight">Falta conectar o Supabase</h1>
      <p className="mt-2 text-muted">
        O PrintUp precisa de um projeto Supabase para autenticação e dados. Defina as variáveis abaixo em{" "}
        <code className="num rounded bg-surface px-1.5 py-0.5">.env.local</code> e reinicie o servidor.
      </p>
      <ul className="mt-6 space-y-2">
        {missing.map((name) => (
          <li key={name} className="rounded-xl border border-line bg-surface px-4 py-3">
            <code className="num text-sm">{name}</code>
            <span className="ml-2 text-sm text-danger">ausente ou inválida</span>
          </li>
        ))}
      </ul>
      <ol className="mt-6 list-decimal space-y-1 pl-5 text-sm text-muted">
        <li>No painel do Supabase: Project Settings → API.</li>
        <li>Copie “Project URL” e a chave pública (anon / publishable).</li>
        <li>Nunca use a chave service_role aqui.</li>
      </ol>
      <p className="mt-6 text-sm text-muted">
        Passo a passo completo no <code className="num">README.md</code>. Para conferir: <code className="num">npm run check:env</code>.
      </p>
    </main>
  );
}
