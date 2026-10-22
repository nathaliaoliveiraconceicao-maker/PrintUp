import Link from "next/link";
import { Button } from "@/components/ui/button";
import { confirmEmailLink } from "@/features/auth/actions";
import { confirmLinkSchema } from "@/features/auth/schema";

export const metadata = { title: "Confirmar e-mail" };

/**
 * Página aberta pelo link do e-mail. Abrir a página NÃO gasta o link: só o clique no botão (POST) o confirma.
 * Assim, leitores automáticos de e-mail (que apenas abrem os links) não invalidam o link antes da pessoa.
 */
export default async function ConfirmPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const parsed = confirmLinkSchema.safeParse(await searchParams);
  if (!parsed.success) {
    return (
      <div className="space-y-4" data-testid="confirmar-invalido">
        <h2 className="text-xl font-semibold">Link inválido</h2>
        <p className="text-sm text-muted">Este link de confirmação está incompleto. Abra o e-mail e clique de novo no link, ou volte para entrar.</p>
        <Link href="/login" className="inline-flex h-11 items-center rounded-xl bg-accent px-5 text-sm font-semibold text-ink">Ir para o login</Link>
      </div>
    );
  }
  const recovery = parsed.data.type === "recovery";
  return (
    <form action={confirmEmailLink} className="space-y-4" data-testid="confirmar-email">
      <h2 className="text-xl font-semibold">{recovery ? "Criar uma nova senha" : "Confirmar o seu e-mail"}</h2>
      <p className="text-sm text-muted">{recovery ? "Clique no botão para continuar e escolher a nova senha." : "Clique no botão para ativar a sua conta no PrintUp."}</p>
      <input type="hidden" name="token_hash" value={parsed.data.token_hash} />
      <input type="hidden" name="type" value={parsed.data.type} />
      {parsed.data.next && <input type="hidden" name="next" value={parsed.data.next} />}
      <Button className="w-full">{recovery ? "Continuar" : "Confirmar e entrar"}</Button>
    </form>
  );
}
