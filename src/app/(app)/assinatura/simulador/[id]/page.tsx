import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PageHeader } from "@/components/ui/card";
import { SimulatorPanel } from "@/features/billing/subscription-actions";
import { resolveGateway } from "@/lib/billing/gateway";
import { createClient } from "@/lib/supabase/server";
import { formatPriceCents } from "@/lib/billing/state";

export const metadata = { title: "Simulador de pagamento" };

export default async function SimulatorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gw = await resolveGateway();
  if (!gw.enabled || gw.gateway.id !== "simulado") notFound(); // em produção esta página não existe
  const supabase = await createClient();
  const { data: co } = await supabase.from("billing_checkouts").select("id, cycle, status, plan:plans(name, price_cents, price_yearly_cents)").eq("id", id).maybeSingle();
  if (!co) notFound();
  const plan = co.plan as unknown as { name: string; price_cents: number; price_yearly_cents: number | null } | null;
  const amount = co.cycle === "anual" ? plan?.price_yearly_cents : plan?.price_cents;
  return (
    <>
      <PageHeader title="Pagamento (simulação)" description="Esta tela substitui a página do gateway apenas em testes." />
      <Card className="mb-6 space-y-2">
        <p className="text-sm text-muted">Plano</p>
        <p className="text-lg font-semibold">{plan?.name} · {co.cycle}</p>
        <p className="num text-2xl font-semibold text-accent-strong">{amount ? formatPriceCents(amount) : "—"}</p>
        <p className="text-xs text-muted">Situação do checkout: {co.status}</p>
      </Card>
      {co.status === "aberto" ? <SimulatorPanel checkoutId={id} /> : <Card className="text-sm">Este checkout já foi concluído. <Link href="/assinatura" className="font-medium text-accent-strong underline">Ver minha assinatura</Link></Card>}
      <p className="mt-4 text-sm text-muted">Depois de simular, volte para <Link href="/assinatura" className="font-medium text-accent-strong underline">Minha assinatura</Link>: o plano só muda quando o webhook confirmar o pagamento.</p>
    </>
  );
}
