import Link from "next/link";
import { Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { EntitlementRow } from "@/lib/billing/state";
import { FEATURES } from "@/lib/billing/state";

/** Aviso quando o plano atual não inclui o recurso da tela. Ver o que já existe continua permitido; criar novos itens é que fica bloqueado (no banco). */
export function PlanNotice({ entitlement, feature }: { entitlement: EntitlementRow | null; feature: string }) {
  if (entitlement?.features[feature]) return null;
  const label = FEATURES[feature]?.label ?? "Este recurso";
  return (
    <Card className="mb-4 flex items-start gap-3 border-warn/40 bg-accent-soft/50 text-sm" role="status" data-testid={`aviso-plano-${feature}`}>
      <Lock size={18} className="mt-0.5 shrink-0 text-warn" aria-hidden="true" />
      <p>
        <strong>{label}</strong> não está incluído no seu plano atual. Você continua vendo tudo o que já criou, mas não dá para criar novos itens.{" "}
        <Link href="/planos" className="font-medium text-accent-strong underline">Ver planos</Link>
      </p>
    </Card>
  );
}
