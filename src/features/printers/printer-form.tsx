"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import type { FormState } from "@/lib/forms";
import { useActionForm } from "@/lib/use-action-form";
import { useState } from "react";
import { printerDisplayName, type PrinterRow } from "./schema";

export function PrinterForm({
  printer,
  action,
}: {
  printer?: PrinterRow;
  action: (s: FormState, f: FormData) => Promise<FormState>;
}) {
  const { state, onSubmit, pending } = useActionForm(action, {} as FormState);
  const e = state.fieldErrors ?? {};
  const v = (n: number | null | undefined) => (n ? String(n).replace(".", ",") : "");
  // Impressoras antigas podem não ter marca/modelo separados: o nome antigo vira o modelo.
  const [brand, setBrand] = useState(printer?.brand ?? "");
  const [model, setModel] = useState(printer?.model ?? (printer?.brand ? "" : (printer?.name ?? "")));

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Card className="space-y-4">
        <h2 className="font-semibold">Identificação da impressora</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Marca" error={e.brand} hint="Ex.: Bambu Lab, Creality, Prusa."><Input name="brand" value={brand} onChange={(ev) => setBrand(ev.target.value)} placeholder="Bambu Lab" maxLength={40} required /></Field>
          <Field label="Nome ou modelo" error={e.model} hint="Ex.: A1 mini, Ender-3 V3 KE."><Input name="model" value={model} onChange={(ev) => setModel(ev.target.value)} placeholder="A1 mini" maxLength={39} required /></Field>
        </div>
        {printerDisplayName(brand, model) && <p className="text-sm text-muted">Vai aparecer como: <strong className="text-ink">{printerDisplayName(brand, model)}</strong></p>}
      </Card>

      <Card className="space-y-4">
        <div>
          <h2 className="font-semibold">Custo da impressora</h2>
          <p className="mt-1 text-sm text-muted">O PrintUp divide o preço da impressora pela vida útil dela para saber quanto ela desgasta a cada hora de impressão.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Preço da impressora (R$)" error={e.purchasePrice} hint="Quanto você pagou nela.">
            <Input name="purchasePrice" inputMode="decimal" defaultValue={v(printer?.purchase_price)} />
          </Field>
          <Field label="Vida útil da impressora (horas)" error={e.lifespanHours} hint="Por quantas horas de impressão ela deve durar. Ex.: 5.000 h.">
            <Input name="lifespanHours" inputMode="decimal" defaultValue={v(printer?.lifespan_hours)} />
          </Field>
          <Field label="Potência média (W)" error={e.powerWatts} hint="Consumo médio durante a impressão.">
            <Input name="powerWatts" inputMode="decimal" defaultValue={v(printer?.power_watts)} />
          </Field>
          <Field label="Desgaste + manutenção (R$/h)" error={e.wearPerHour} hint="Compra ÷ vida útil + peças de reposição por hora.">
            <Input name="wearPerHour" inputMode="decimal" defaultValue={v(printer?.wear_per_hour)} />
          </Field>
        </div>
      </Card>

      <Card className="space-y-4">
        <div>
          <h2 className="font-semibold">Custo da hora (opcional)</h2>
          <p className="mt-1 text-sm text-muted">
            Se você já calculou um valor fechado por hora, informe aqui e marque o que ele já inclui — assim a
            calculadora não soma esses itens duas vezes.
          </p>
        </div>
        <Field label="Custo da hora (R$/h)" error={e.hourlyCost}>
          <Input name="hourlyCost" inputMode="decimal" defaultValue={v(printer?.hourly_cost)} />
        </Field>
        <div className="space-y-1">
          <Checkbox name="includesEnergy" label="Já inclui energia elétrica" defaultChecked={printer?.hourly_includes_energy} />
          <Checkbox name="includesWear" label="Já inclui desgaste e manutenção" defaultChecked={printer?.hourly_includes_wear} />
          <Checkbox name="includesFixed" label="Já inclui custos fixos (aluguel, internet…)" defaultChecked={printer?.hourly_includes_fixed} />
        </div>
      </Card>

      <Field label="Observações" error={e.notes}>
        <Textarea name="notes" defaultValue={printer?.notes ?? ""} />
      </Field>

      <FormMessage error={state.error} />
      <div className="flex gap-3">
        <SubmitButton pending={pending}>Salvar impressora</SubmitButton>
        <Button asChild variant="secondary"><Link href="/impressoras">Cancelar</Link></Button>
      </div>
    </form>
  );
}
