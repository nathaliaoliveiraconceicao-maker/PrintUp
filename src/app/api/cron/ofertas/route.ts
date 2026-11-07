import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runScheduled } from "@/features/offers/cron";
import { offersRepo, siteUrl } from "@/features/offers/server";
import { logEvent } from "@/features/admin/log";
import { sendEmail } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request): boolean | null {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return null; // não configurado
  const got = req.headers.get("authorization") ?? "";
  const want = `Bearer ${secret}`;
  const a = Buffer.from(got), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Chamada pelo agendador (Vercel Cron envia `Authorization: Bearer $CRON_SECRET`). Sem o segredo configurado, recusa tudo. */
export async function GET(req: Request) {
  const ok = authorized(req);
  if (ok === null) return NextResponse.json({ erro: "CRON_SECRET não configurado" }, { status: 503 });
  if (!ok) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  try {
    const repo = offersRepo();
    const admin = createAdminClient();
    const summary = await runScheduled({
      repo,
      collector: { env: process.env },
      alerts: {
        siteUrl: siteUrl(),
        getEmail: async (userId) => (await admin.auth.admin.getUserById(userId)).data.user?.email ?? null,
        send: (m) => sendEmail(m),
      },
    });
    await logEvent("sistema", summary.fontes.some((f) => f.status === "falhou") ? "aviso" : "info", "Rotina de ofertas executada", { fontes: summary.fontes.length, expiradas: summary.expiradas });
    return NextResponse.json({ ok: true, ...summary });
  } catch {
    await logEvent("sistema", "erro", "Falha na rotina de ofertas");
    return NextResponse.json({ erro: "falha na rotina" }, { status: 500 });
  }
}
