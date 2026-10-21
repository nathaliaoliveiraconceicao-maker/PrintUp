import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildQuotePdf } from "@/features/quotes/pdf";
import { loadQuotePdfData } from "@/features/quotes/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return new NextResponse("Não encontrado", { status: 404 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Entre na sua conta para baixar o PDF.", { status: 401 });

  // RLS: só orçamentos do próprio usuário são encontrados.
  const loaded = await loadQuotePdfData(supabase, id);
  if (!loaded) return new NextResponse("Não encontrado", { status: 404 });
  const pdf = await buildQuotePdf(loaded.data);
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="orcamento-${String(loaded.quote.number).padStart(4, "0")}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
