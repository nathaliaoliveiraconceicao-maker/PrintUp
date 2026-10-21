"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { updateOrderDetails } from "./actions";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABEL } from "./status";

export function OrderDetailsForm({ orderId, dueDate, method, notes, locked }: { orderId: string; dueDate: string | null; method: string | null; notes: string | null; locked: boolean }) {
  const router = useRouter();
  const [due, setDue] = useState(dueDate ?? "");
  const [m, setM] = useState(method ?? "");
  const [n, setN] = useState(notes ?? "");
  const [msg, setMsg] = useState<{ ok?: boolean; error?: string }>({});
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3" data-testid="detalhes-pedido">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Prazo de entrega"><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} disabled={locked} /></Field>
        <Field label="Forma de pagamento">
          <Select value={m} onChange={(e) => setM(e.target.value)} disabled={locked}>
            <option value="">A definir</option>
            {PAYMENT_METHODS.map((x) => <option key={x} value={x}>{PAYMENT_METHOD_LABEL[x]}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Observações"><Textarea value={n} onChange={(e) => setN(e.target.value)} maxLength={2000} className="min-h-16" disabled={locked} /></Field>
      {msg.error && <p role="alert" className="text-sm text-danger">{msg.error}</p>}
      {msg.ok && <p role="status" className="text-sm text-ok">Salvo.</p>}
      {!locked && (
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => start(async () => { const r = await updateOrderDetails(orderId, { dueDate: due || null, paymentMethod: m || null, notes: n }); setMsg(r.ok ? { ok: true } : { error: r.error }); if (r.ok) router.refresh(); })}>
          {pending ? "Salvando…" : "Salvar prazo e observações"}
        </Button>
      )}
    </div>
  );
}
