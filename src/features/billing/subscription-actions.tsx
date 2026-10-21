"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cancelSubscription, reconcileMine, simulate, type BillingActionState, type SimKind } from "./actions";

export function SubscriptionActions({ canCancel, hasGatewaySub }: { canCancel: boolean; hasGatewaySub: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<BillingActionState>({});
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<BillingActionState>) => start(async () => { const r = await fn(); setState(r); if (r.ok) router.refresh(); });
  return (
    <div className="space-y-3" data-testid="acoes-assinatura">
      <div className="flex flex-wrap gap-2">
        {hasGatewaySub && <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(reconcileMine)}>Atualizar situação</Button>}
        {canCancel && (
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => { if (confirm("Cancelar a assinatura? Você continua com o plano até o fim do período já pago e seus dados ficam salvos.")) run(cancelSubscription); }}>
            Cancelar assinatura
          </Button>
        )}
      </div>
      {state.error && <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{state.error}</p>}
      {state.ok && state.message && <p role="status" className="rounded-xl bg-ok/10 px-3 py-2 text-sm text-ok">{state.message}</p>}
    </div>
  );
}

const KINDS: { kind: SimKind; label: string }[] = [
  { kind: "renovacao", label: "Renovação paga" },
  { kind: "falha", label: "Cobrança falhou" },
  { kind: "duplicado", label: "Webhook duplicado" },
  { kind: "cancelamento_agendado", label: "Cancelamento no fim do período" },
  { kind: "cancelamento", label: "Cancelamento imediato" },
];

/** Só aparece no ambiente de simulação. Envia webhooks ASSINADOS à rota real, como faria um gateway. */
export function SimulatorPanel({ checkoutId }: { checkoutId?: string }) {
  const router = useRouter();
  const [state, setState] = useState<BillingActionState>({});
  const [pending, start] = useTransition();
  const go = (kind: SimKind) => start(async () => { const r = await simulate(kind, checkoutId); setState(r); if (r.ok) router.refresh(); });
  return (
    <div className="space-y-3 rounded-2xl border border-dashed border-warn/50 bg-accent-soft/40 p-4" data-testid="simulador">
      <p className="text-sm font-medium">Simulador de pagamentos (somente teste — nenhuma cobrança real)</p>
      <div className="flex flex-wrap gap-2">
        {checkoutId && (
          <>
            <Button size="sm" disabled={pending} onClick={() => go("aprovado")}>Simular pagamento aprovado</Button>
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => go("recusado")}>Simular pagamento recusado</Button>
          </>
        )}
        {!checkoutId && KINDS.map((k) => <Button key={k.kind} size="sm" variant="secondary" disabled={pending} onClick={() => go(k.kind)}>{k.label}</Button>)}
      </div>
      {state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      {state.ok && <p role="status" className="text-sm text-ok">{state.message}</p>}
    </div>
  );
}
