import { NextResponse } from "next/server";
import { dbErrorMessage } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { buildQuotePdf } from "@/features/quotes/pdf";
import { loadQuotePdfData } from "@/features/quotes/server";
import { logEvent } from "@/features/admin/log";

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
  // Cota mensal de PDFs do plano (cada orçamento conta uma vez por mês; a trava é no banco, resistente a requisições simultâneas).
  const { error: quotaErr } = await supabase.rpc("consume_quota", { p_metric: "pdf_month", p_ref: id });
  if (quotaErr) return new NextResponse(dbErrorMessage(quotaErr), { status: 403, headers: { "content-type": "text/plain; charset=utf-8" } });
  let pdf: Uint8Array;
  try {
    pdf = await buildQuotePdf(loaded.data);
  } catch {
    await logEvent("pdf", "erro", "Falha ao gerar o PDF do orçamento", { quote_id: id }, user.id);
    return new NextResponse("Não foi possível gerar o PDF agora. Tente novamente.", { status: 500, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="orcamento-${String(loaded.quote.number).padStart(4, "0")}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
