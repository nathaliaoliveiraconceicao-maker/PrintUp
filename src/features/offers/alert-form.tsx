"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Bell, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import type { FormState } from "@/lib/forms";
import { useActionForm } from "@/lib/use-action-form";
import { OFFER_CATEGORIES } from "./categories";
import { createAlert, deleteAlert, setAlertActive } from "./actions";

export function AlertForm() {
  const { state, onSubmit, pending } = useActionForm(createAlert, {} as FormState);
  const [kind, setKind] = useState("preco_abaixo");
  const fe = state.fieldErrors ?? {};
  return (
    <form onSubmit={onSubmit} className="space-y-4" data-testid="form-alerta">
      <Card className="space-y-4">
        <h2 className="font-semibold">Novo alerta</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Avisar quando…" error={fe.kind}>
            <Select name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="preco_abaixo">o preço ficar abaixo de um valor</option>
              <option value="desconto_acima">houver desconto comprovado acima de…</option>
              <option value="voltou_estoque">o produto voltar ao estoque</option>
            </Select>
          </Field>
          <Field label="Categoria (opcional)" error={fe.category}>
            <Select name="category" defaultValue="">
              <option value="">Qualquer</option>
              {OFFER_CATEGORIES.map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}
            </Select>
          </Field>
          <Field label="Palavras do nome (opcional)" error={fe.query} hint="Ex.: marca ou modelo. Todas precisam aparecer no nome."><Input name="query" maxLength={80} placeholder="ex.: pla marca x" /></Field>
          {kind === "preco_abaixo" && <>
            <Field label="Preço máximo (R$)" error={fe.maxPrice}><Input name="maxPrice" inputMode="decimal" placeholder="ex.: 120" /></Field>
            <Field label="ou preço máximo por kg (R$) — só filamentos" error={fe.maxPricePerKg}><Input name="maxPricePerKg" inputMode="decimal" placeholder="ex.: 60" /></Field>
          </>}
          {kind === "desconto_acima" && <Field label="Desconto mínimo (%)" error={fe.minDiscount} hint="Só conta desconto com preço anterior comprovado."><Input name="minDiscount" inputMode="decimal" placeholder="ex.: 20" /></Field>}
        </div>
        <FormMessage error={state.error} ok={state.ok} />
        <SubmitButton pending={pending}><Bell size={16} />Criar alerta</SubmitButton>
      </Card>
    </form>
  );
}

export function AlertRow({ id, label, active }: { id: string; label: string; active: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<FormState>({});
  const run = (fn: () => Promise<FormState>) => start(async () => { setMsg(await fn()); router.refresh(); });
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3" data-testid="alerta">
      <div className="min-w-0"><p className="font-medium">{label}</p><p className="text-xs text-muted">{active ? "Ativo · aviso por e-mail" : "Pausado"}</p>{msg.error && <p role="alert" className="text-xs text-danger">{msg.error}</p>}</div>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => setAlertActive(id, !active))}>{active ? "Pausar" : "Ativar"}</Button>
        <Button size="sm" variant="ghost" disabled={pending} aria-label="Apagar alerta" onClick={() => { if (confirm("Apagar este alerta?")) run(() => deleteAlert(id)); }}><Trash2 size={16} /></Button>
      </div>
    </li>
  );
}
