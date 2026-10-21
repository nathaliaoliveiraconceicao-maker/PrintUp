"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { formatBRL, parseDecimal } from "@/lib/utils";
import { formatDateBR, todayBR } from "@/features/quotes/status";
import { recordPayment } from "./actions";
import type { OrderActionState, PaymentRow } from "./schema";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABEL, type PaymentMethod } from "./status";

export function PaymentsPanel({ orderId, payments, balance, received, cancelled }: { orderId: string; payments: PaymentRow[]; balance: number; received: number; cancelled: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState<"recebimento" | "estorno" | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod | "">("");
  const [date, setDate] = useState(todayBR());
  const [note, setNote] = useState("");
  const [state, setState] = useState<OrderActionState>({});
  const [pending, start] = useTransition();

  const submit = () =>
    start(async () => {
      const v = parseDecimal(amount);
      const r = await recordPayment({ orderId, kind: open, amount: Number.isNaN(v) ? 0 : v, method: method || null, paidAt: date, note });
      setState(r);
      if (r.ok) { setOpen(null); setAmount(""); setNote(""); router.refresh(); }
    });

  return (
    <div className="space-y-3" data-testid="pagamentos">
      {payments.length === 0 ? (
        <p className="text-sm text-muted">Nenhum pagamento lançado. Pedido não pago não conta como receita recebida.</p>
      ) : (
        <ul className="divide-y divide-line text-sm">
          {payments.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-2">
              <span>
                <span className="block font-medium">{p.kind === "estorno" ? "Estorno" : "Recebimento"}{p.method ? ` · ${PAYMENT_METHOD_LABEL[p.method]}` : ""}</span>
                <span className="block text-xs text-muted">{formatDateBR(p.paid_at)}{p.note ? ` · ${p.note}` : ""}</span>
              </span>
              <span className={`num font-medium ${p.kind === "estorno" ? "text-danger" : "text-ok"}`}>{p.kind === "estorno" ? "- " : ""}{formatBRL(p.amount)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        {!cancelled && balance > 0 && <Button size="sm" variant="secondary" onClick={() => { setOpen("recebimento"); setAmount(String(balance).replace(".", ",")); setState({}); }}>Lançar recebimento</Button>}
        {received > 0 && <Button size="sm" variant="ghost" onClick={() => { setOpen("estorno"); setAmount(""); setState({}); }}>Lançar estorno</Button>}
      </div>
      {open && (
        <div className="space-y-3 rounded-xl border border-line bg-paper p-3" data-testid="form-pagamento">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={open === "estorno" ? "Valor devolvido (R$)" : "Valor recebido (R$)"}><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
            <Field label="Forma"><Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod | "")}><option value="">Não informar</option>{PAYMENT_METHODS.map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</option>)}</Select></Field>
            <Field label="Data"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          </div>
          <Field label="Observação (opcional)"><Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} /></Field>
          {state.error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{state.error}</p>}
          <div className="flex gap-2">
            <Button size="sm" disabled={pending} onClick={submit}>{pending ? "Salvando…" : "Confirmar"}</Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(null)}>Fechar</Button>
          </div>
        </div>
      )}
    </div>
  );
}
