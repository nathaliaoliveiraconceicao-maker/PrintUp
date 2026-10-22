import Link from "next/link";
import { Logo } from "@/components/logo";
import { createClient } from "@/lib/supabase/server";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: settings } = await supabase.from("platform_settings").select("key, value").in("key", ["support_email", "terms_url", "privacy_url"]);
  const setting = (k: string) => {
    const v = settings?.find((r) => r.key === k)?.value;
    return typeof v === "string" && v ? v : null;
  };
  const support = setting("support_email");
  const terms = setting("terms_url");
  const privacy = setting("privacy_url");
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-3">
          <Link href="/" aria-label="PrintUp"><Logo /></Link>
          <nav aria-label="Conta" className="flex items-center gap-2 text-sm">
            {user ? (
              <>
                <Link href="/assinatura" className="flex h-11 items-center rounded-xl px-3 font-medium hover:bg-paper">Minha assinatura</Link>
                <Link href="/" className="flex h-11 items-center rounded-xl bg-ink px-4 font-medium text-paper">Voltar ao painel</Link>
              </>
            ) : (
              <>
                <Link href="/login" className="flex h-11 items-center rounded-xl px-3 font-medium hover:bg-paper">Entrar</Link>
                <Link href="/cadastro" className="flex h-11 items-center rounded-xl bg-accent px-4 font-semibold text-ink hover:brightness-95">Criar conta</Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-10">{children}</main>
      <footer className="space-y-1 border-t border-line py-6 text-center text-xs text-muted">
        <p>PrintUp · precificação e gestão para impressão 3D</p>
        {(support || terms || privacy) && (
          <p className="flex flex-wrap justify-center gap-x-4">
            {support && <a className="underline" href={`mailto:${support}`}>Suporte: {support}</a>}
            {terms && <a className="underline" href={terms} rel="noopener noreferrer">Termos de uso</a>}
            {privacy && <a className="underline" href={privacy} rel="noopener noreferrer">Privacidade</a>}
          </p>
        )}
      </footer>
    </div>
  );
}
