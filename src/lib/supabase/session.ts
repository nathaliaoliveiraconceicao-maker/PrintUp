import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "@/lib/env";

// /planos é a página comercial (pública); /api/webhooks recebe o gateway (autenticado pela ASSINATURA do corpo, não por login).
const PUBLIC_PATHS = ["/login", "/cadastro", "/recuperar-senha", "/auth", "/planos", "/inicio", "/api/webhooks"];

/** Renova a sessão e redireciona visitantes anônimos para /login. A autorização real continua no RLS. */
export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Sem Supabase configurado, tudo leva à tela de instruções (/setup).
  const env = getSupabaseEnv();
  if (!env) {
    if (path === "/setup") return NextResponse.next({ request });
    const url = request.nextUrl.clone();
    url.pathname = "/setup";
    url.search = "";
    return NextResponse.redirect(url);
  }
  if (path === "/setup") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    env.url,
    env.anonKey,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(list) {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // getUser() valida o token no servidor do Supabase (getSession() não valida).
  const { data: { user } } = await supabase.auth.getUser();
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

  // Visitante na raiz vê a página de apresentação (a URL continua "/"); quem está logado vê o painel.
  if (!user && path === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/inicio";
    const rewritten = NextResponse.rewrite(url, { request });
    response.cookies.getAll().forEach((c) => rewritten.cookies.set(c));
    return rewritten;
  }
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  if (user && (path === "/login" || path === "/cadastro")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }
  return response;
}
