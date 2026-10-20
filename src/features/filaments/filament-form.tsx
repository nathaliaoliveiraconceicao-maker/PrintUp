"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import type { FormState } from "@/lib/forms";
import { useActionForm } from "@/lib/use-action-form";
import { MATERIALS, type FilamentRow } from "./schema";

export function FilamentForm({
  filament,
  action,
}: {
  filament?: FilamentRow;
  action: (s: FormState, f: FormData) => Promise<FormState>;
}) {
  const { state, onSubmit, pending } = useActionForm(action, {} as FormState);
  const e = state.fieldErrors ?? {};
  const v = (n: number | null | undefined) => (n ? String(n).replace(".", ",") : "");

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Card className="space-y-4">
        <Field label="Nome" error={e.name}>
          <Input name="name" defaultValue={filament?.name} placeholder="Ex.: PLA Basic Preto" required />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Material" error={e.material}>
            <Select name="material" defaultValue={filament?.material ?? "PLA"}>
              {MATERIALS.map((m) => <option key={m}>{m}</option>)}
            </Select>
          </Field>
          <Field label="Marca" error={e.brand}><Input name="brand" defaultValue={filament?.brand ?? ""} /></Field>
          <Field label="Cor" error={e.color}><Input name="color" defaultValue={filament?.color ?? ""} /></Field>
          <Field label="Peso do carretel (g)" error={e.spoolWeightG}>
            <Input name="spoolWeightG" inputMode="decimal" defaultValue={v(filament?.spool_weight_g ?? 1000)} />
          </Field>
        </div>
        <Field label="Preço por kg (R$)" error={e.pricePerKg} hint="Valor pago por 1 kg. Se o carretel tem 750 g, converta para kg.">
          <Input name="pricePerKg" inputMode="decimal" defaultValue={v(filament?.price_per_kg)} required />
        </Field>
        <Field label="Observações" error={e.notes}>
          <Textarea name="notes" defaultValue={filament?.notes ?? ""} />
        </Field>
      </Card>
      <FormMessage error={state.error} />
      <div className="flex gap-3">
        <SubmitButton pending={pending}>Salvar filamento</SubmitButton>
        <Button asChild variant="secondary"><Link href="/filamentos">Cancelar</Link></Button>
      </div>
    </form>
  );
}
