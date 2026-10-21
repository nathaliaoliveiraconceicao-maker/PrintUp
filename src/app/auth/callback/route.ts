import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/features/auth/schema";
import { createClient } from "@/lib/supabase/server";

/** Conclui a confirmação de e-mail e a recuperação de senha (PKCE). Só redireciona para caminhos internos da lista. */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(safeNextPath(request.nextUrl.searchParams.get("next")), request.url));
  }
  return NextResponse.redirect(new URL("/login?erro=link", request.url));
}
