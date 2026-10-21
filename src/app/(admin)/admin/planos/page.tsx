import { PageHeader } from "@/components/ui/card";
import { PlanForm } from "@/features/admin/forms";
import { requireAdminPage } from "@/features/admin/guard";
import { loadPlans } from "@/features/admin/server";

export const metadata = { title: "Planos · Administração" };

export default async function PlansPage() {
  const { supabase } = await requireAdminPage();
  const plans = await loadPlans(supabase);
  return (
    <>
      <PageHeader title="Planos" description="Preços, limites e recursos vêm do banco. Mudar o preço NÃO altera assinaturas já contratadas (o valor cobrado já está no gateway); limites e recursos valem para todos do plano." />
      <div className="space-y-5">{plans.map((p) => <PlanForm key={p.id} plan={p} />)}</div>
    </>
  );
}
