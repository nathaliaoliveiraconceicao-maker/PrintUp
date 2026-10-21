"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { BillingCycle } from "@/lib/billing/gateway";
import { changePlan, startCheckout } from "./actions";

/** Botão de contratar/alterar plano. A confirmação do pagamento vem do gateway, nunca desta tela. */
export function PlanButton({ planCode, cycle, mode, label, disabled }: { planCode: string; cycle: BillingCycle; mode: "contratar" | "alterar"; label: string; disabled?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [msg, setMsg] = useState<string>();
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <Button
        className="w-full"
        disabled={pending || disabled}
        data-testid={`plano-${planCode}`}
        onClick={() =>
          start(async () => {
            setError(undefined);
            setMsg(undefined);
            if (mode === "contratar") {
              const r = await startCheckout(planCode, cycle);
              if (r.url) window.location.assign(r.url);
              else setError(r.error);
            } else {
              const r = await changePlan(planCode, cycle);
              if (r.ok) { setMsg(r.message); router.refresh(); } else setError(r.error);
            }
          })
        }
      >
        {pending ? "Aguarde…" : label}
      </Button>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {msg && <p role="status" className="text-sm text-ok">{msg}</p>}
    </div>
  );
}
