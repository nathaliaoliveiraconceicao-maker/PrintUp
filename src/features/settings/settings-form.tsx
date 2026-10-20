"use client";

import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import type { FormState } from "@/lib/forms";
import { useActionForm } from "@/lib/use-action-form";
import { saveSettings } from "./actions";
import type { SettingsRow } from "./schema";

const v = (n: number) => String(n).replace(".", ",");

export function SettingsForm({ settings }: { settings: SettingsRow }) {
  const { state, onSubmit, pending } = useActionForm(saveSettings, {} as FormState);
  const e = state.fieldErrors ?? {};
  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Card className="space-y-4">
        <div>
          <h2 className="font-semibold">Custos fixos do negócio</h2>
          <p className="mt-1 text-sm text-muted">
            Aluguel, internet, softwares, contador. Não inclua energia da impressora nem desgaste de máquina — eles já são
            calculados por impressora.
          </p>
        </div>
        <Field label="Total mensal (R$)" error={e.monthlyFixedCosts}>
          <Input name="monthlyFixedCosts" inputMode="decimal" defaultValue={v(settings.monthly_fixed_costs)} />
        </Field>
        <Field label="Como ratear" error={e.fixedAllocation}>
          <Select name="fixedAllocation" defaultValue={settings.fixed_allocation}>
            <option value="per_hour">Por hora produtiva</option>
            <option value="per_unit">Por peça produzida</option>
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Horas produtivas por mês" error={e.productiveHoursPerMonth} hint="Usado no rateio por hora.">
            <Input name="productiveHoursPerMonth" inputMode="decimal" defaultValue={v(settings.productive_hours_per_month)} />
          </Field>
          <Field label="Peças produzidas por mês" error={e.monthlyUnits} hint="Usado no rateio por peça.">
            <Input name="monthlyUnits" inputMode="decimal" defaultValue={v(settings.monthly_units)} />
          </Field>
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="font-semibold">Custos variáveis</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Energia (R$/kWh)" error={e.energyPricePerKwh}>
            <Input name="energyPricePerKwh" inputMode="decimal" defaultValue={v(settings.energy_price_per_kwh)} />
          </Field>
          <Field label="Mão de obra (R$/h)" error={e.laborHourlyRate}>
            <Input name="laborHourlyRate" inputMode="decimal" defaultValue={v(settings.labor_hourly_rate)} />
          </Field>
          <Field label="Perdas (%)" error={e.lossPercent} hint="Falhas e desperdício.">
            <Input name="lossPercent" inputMode="decimal" defaultValue={v(settings.loss_percent)} />
          </Field>
        </div>
      </Card>

      <Card className="space-y-4">
        <div>
          <h2 className="font-semibold">Venda</h2>
          <p className="mt-1 text-sm text-muted">Percentuais incidem sobre o preço de venda.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Taxa de venda (%)" error={e.saleFeePercent}>
            <Input name="saleFeePercent" inputMode="decimal" defaultValue={v(settings.sale_fee_percent)} />
          </Field>
          <Field label="Taxa fixa por venda (R$)" error={e.saleFeeFixed}>
            <Input name="saleFeeFixed" inputMode="decimal" defaultValue={v(settings.sale_fee_fixed)} />
          </Field>
          <Field label="Impostos (%)" error={e.taxPercent}>
            <Input name="taxPercent" inputMode="decimal" defaultValue={v(settings.tax_percent)} />
          </Field>
          <Field label="Margem de lucro padrão (%)" error={e.marginPercent}>
            <Input name="marginPercent" inputMode="decimal" defaultValue={v(settings.margin_percent)} />
          </Field>
        </div>
      </Card>

      <FormMessage error={state.error} ok={state.ok} />
      <SubmitButton pending={pending}>Salvar configurações</SubmitButton>
    </form>
  );
}
