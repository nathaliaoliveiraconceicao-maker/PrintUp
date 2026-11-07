import Link from "next/link";
import { Card, PageHeader } from "@/components/ui/card";
import { emailConfigured } from "@/lib/email";
import { AlertForm, AlertRow } from "@/features/offers/alert-form";
import { categoryLabel } from "@/features/offers/categories";
import type { AlertRule } from "@/features/offers/alerts";
import { createClient } from "@/lib/supabase/server";
import { formatBRL } from "@/lib/utils";

export const metadata = { title: "Alertas de preço" };

export function describeRule(r: AlertRule): string {
  const what = [r.category ? categoryLabel(r.category) : null, r.query ? `“${r.query}”` : null].filter(Boolean).join(" · ") || "Qualquer produto";
  if (r.kind === "voltou_estoque") return `${what}: quando voltar ao estoque`;
  if (r.kind === "desconto_acima") return `${what}: desconto comprovado acima de ${r.minDiscountPct}%`;
  return `${what}: ${[r.maxPriceCents !== undefined ? `abaixo de ${formatBRL(r.maxPriceCents / 100)}` : null, r.maxPricePerKgCents !== undefined ? `abaixo de ${formatBRL(r.maxPricePerKgCents / 100)}/kg` : null].filter(Boolean).join(" ou ")}`;
}

export default async function AlertsPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("offer_alerts").select("id, rule, is_active, created_at").order("created_at", { ascending: false });
  const rows = (data ?? []) as { id: string; rule: AlertRule; is_active: boolean }[];
  return (
    <>
      <PageHeader title="Alertas de preço" description="Avisamos por e-mail quando uma oferta combinar com o que você procura, sem repetir o mesmo aviso." />
      {!emailConfigured() && <Card className="mb-4 bg-accent-soft text-sm text-warn" data-testid="aviso-email">O envio de e-mails ainda não está ativo neste ambiente: seus alertas ficam salvos e passam a avisar assim que o envio for configurado.</Card>}
      <div className="space-y-6">
        <AlertForm />
        <Card data-testid="lista-alertas">
          <h2 className="mb-2 font-semibold">Seus alertas</h2>
          {rows.length === 0 ? <p className="text-sm text-muted">Nenhum alerta ainda. Veja as <Link href="/ofertas" className="font-medium text-accent-strong underline">ofertas</Link> para ter ideias.</p> : <ul className="divide-y divide-line">{rows.map((r) => <AlertRow key={r.id} id={r.id} label={describeRule(r.rule)} active={r.is_active} />)}</ul>}
          <p className="mt-3 text-xs text-muted">Máximo de 20 alertas. WhatsApp e notificações no celular ficam para uma etapa futura, com o seu consentimento.</p>
        </Card>
      </div>
    </>
  );
}
