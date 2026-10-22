"use client";

import Link from "next/link";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import type { FormState } from "@/lib/forms";
import { useActionForm } from "@/lib/use-action-form";
import { formatBRL, parseDecimal } from "@/lib/utils";
import { saveSettings } from "./actions";
import { FIXED_ITEMS, itemValues, markupToMultiplier, type SettingsRow } from "./schema";

const v = (n: number) => (n ? String(n).replace(".", ",") : "");
const num = (s: string) => (Number.isNaN(parseDecimal(s)) ? 0 : parseDecimal(s));

/** Configuração feita UMA vez: tudo o que a calculadora usa em todos os cálculos. */
export function SettingsForm({ settings }: { settings: SettingsRow }) {
  const { state, onSubmit, pending } = useActionForm(saveSettings, {} as FormState);
  const e = state.fieldErrors ?? {};
  const initial = itemValues(settings);
  const [items, setItems] = useState<Record<string, string>>(Object.fromEntries(FIXED_ITEMS.map(([k]) => [k, v(initial[k])])));
  const [alloc, setAlloc] = useState(settings.fixed_allocation);
  const [mode, setMode] = useState(settings.pricing_mode);
  const total = FIXED_ITEMS.reduce((s, [k]) => s + num(items[k]), 0);

  return (
    <form onSubmit={onSubmit} className="space-y-6" data-testid="form-configuracoes-custo">
      <Card className="space-y-4">
        <div>
          <h2 className="font-semibold">01 · Impressão e materiais</h2>
          <p className="mt-1 text-sm text-muted">Valores usados para calcular energia, mão de obra, embalagem e frete de cada peça.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Energia (R$/kWh)" error={e.energyPricePerKwh}><Input name="energyPricePerKwh" inputMode="decimal" defaultValue={v(settings.energy_price_per_kwh)} /></Field>
          <Field label="Sua mão de obra (R$/h)" error={e.laborHourlyRate} hint="Usada quando você informa minutos de trabalho manual."><Input name="laborHourlyRate" inputMode="decimal" defaultValue={v(settings.labor_hourly_rate)} /></Field>
          <Field label="Embalagem por peça (R$)" error={e.packagingPerUnit}><Input name="packagingPerUnit" inputMode="decimal" defaultValue={v(settings.packaging_per_unit)} /></Field>
          <Field label="Frete por peça (R$)" error={e.shippingPerUnit}><Input name="shippingPerUnit" inputMode="decimal" defaultValue={v(settings.shipping_per_unit)} /></Field>
        </div>
        <p className="rounded-xl bg-paper px-3 py-2 text-sm text-muted">
          A <strong className="text-ink">potência</strong>, o <strong className="text-ink">preço e a vida útil</strong> de cada impressora ficam em <Link href="/impressoras" className="font-medium text-accent-strong underline">Impressoras</Link>.
          O <strong className="text-ink">preço por kg</strong> de cada filamento fica em <Link href="/filamentos" className="font-medium text-accent-strong underline">Filamentos</Link>.
        </p>
      </Card>

      <Card className="space-y-4">
        <div>
          <h2 className="font-semibold">02 · Despesas mensais</h2>
          <p className="mt-1 text-sm text-muted">Seus custos fixos do mês. Não inclua energia nem desgaste da impressora: eles já são calculados por peça.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {FIXED_ITEMS.map(([k, label]) => (
            <Field key={k} label={`${label} (R$/mês)`} error={e[`item_${k}`]}>
              <Input name={`item_${k}`} inputMode="decimal" value={items[k]} onChange={(ev) => setItems({ ...items, [k]: ev.target.value })} />
            </Field>
          ))}
        </div>
        <p className="text-sm" data-testid="total-despesas">Total das despesas: <strong className="num">{formatBRL(total)}</strong> por mês</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Como ratear as despesas" error={e.fixedAllocation}>
            <Select name="fixedAllocation" value={alloc} onChange={(ev) => setAlloc(ev.target.value as typeof alloc)}>
              <option value="revenue_percent">Pelo faturamento previsto (recomendado)</option>
              <option value="per_hour">Por hora produtiva</option>
              <option value="per_unit">Por peça produzida</option>
            </Select>
          </Field>
          <div className={alloc === "revenue_percent" ? "" : "hidden"}>
            <Field label="Faturamento previsto (R$/mês)" error={e.expectedRevenue} hint="Quanto você espera vender por mês. Despesas ÷ faturamento = o quanto cada R$ de custo carrega de despesa fixa.">
              <Input name="expectedRevenue" inputMode="decimal" defaultValue={v(settings.expected_revenue)} />
            </Field>
          </div>
          <div className={alloc === "per_hour" ? "" : "hidden"}>
            <Field label="Horas produtivas por mês" error={e.productiveHoursPerMonth}><Input name="productiveHoursPerMonth" inputMode="decimal" defaultValue={v(settings.productive_hours_per_month)} /></Field>
          </div>
          <div className={alloc === "per_unit" ? "" : "hidden"}>
            <Field label="Peças produzidas por mês" error={e.monthlyUnits}><Input name="monthlyUnits" inputMode="decimal" defaultValue={v(settings.monthly_units)} /></Field>
          </div>
        </div>
        {/* campos de rateio não usados continuam enviados (com o valor atual) */}
        {alloc !== "revenue_percent" && <input type="hidden" name="expectedRevenue" value={v(settings.expected_revenue)} />}
        {alloc !== "per_hour" && <input type="hidden" name="productiveHoursPerMonth" value={v(settings.productive_hours_per_month)} />}
        {alloc !== "per_unit" && <input type="hidden" name="monthlyUnits" value={v(settings.monthly_units)} />}
      </Card>

      <Card className="space-y-4">
        <div>
          <h2 className="font-semibold">03 · Preço de venda</h2>
          <p className="mt-1 text-sm text-muted">Como o PrintUp chega ao preço sugerido. Você ainda pode mudar a margem em cada cálculo.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Como definir o preço" error={e.pricingMode}>
            <Select name="pricingMode" value={mode} onChange={(ev) => setMode(ev.target.value as typeof mode)}>
              <option value="margin">Margem de lucro sobre o preço (recomendado)</option>
              <option value="markup">Multiplicador do custo (×)</option>
            </Select>
          </Field>
          <div className={mode === "margin" ? "" : "hidden"}>
            <Field label="Margem de lucro padrão (%)" error={e.marginPercent} hint="Quanto do preço de venda sobra de lucro."><Input name="marginPercent" inputMode="decimal" defaultValue={v(settings.margin_percent)} /></Field>
          </div>
          <div className={mode === "markup" ? "" : "hidden"}>
            <Field label="Multiplicador do custo (×)" error={e.markupMultiplier} hint="Ex.: 3 = o preço é 3 vezes o custo."><Input name="markupMultiplier" inputMode="decimal" defaultValue={v(markupToMultiplier(settings.markup_percent))} /></Field>
          </div>
          <Field label="Reserva para falhas e perdas (%)" error={e.lossPercent} hint="Falhas de impressão e desperdício de filamento."><Input name="lossPercent" inputMode="decimal" defaultValue={v(settings.loss_percent)} /></Field>
          <Field label="Impostos (%)" error={e.taxPercent} hint="Sobre o preço de venda."><Input name="taxPercent" inputMode="decimal" defaultValue={v(settings.tax_percent)} /></Field>
          <Field label="Venda direta: taxa (%)" error={e.saleFeePercent} hint="Cartão, Pix, link de pagamento. Deixe 0 se não houver."><Input name="saleFeePercent" inputMode="decimal" defaultValue={v(settings.sale_fee_percent)} /></Field>
          <Field label="Venda direta: taxa fixa (R$)" error={e.saleFeeFixed}><Input name="saleFeeFixed" inputMode="decimal" defaultValue={v(settings.sale_fee_fixed)} /></Field>
        </div>
        {mode === "margin" ? <input type="hidden" name="markupMultiplier" value={v(markupToMultiplier(settings.markup_percent))} /> : <input type="hidden" name="marginPercent" value={v(settings.margin_percent)} />}
        <Checkbox name="roundToReal" label="Arredondar o preço para cima, para o próximo real inteiro" defaultChecked={settings.price_rounding === "real"} />
        <div className="rounded-xl border border-line bg-paper p-4 text-sm text-muted" data-testid="como-calcula">
          <strong className="mb-1 block text-ink">Como o PrintUp calcula</strong>
          Custo = filamento + energia + desgaste e custo da hora da impressora + mão de obra + embalagem e frete + rateio das despesas mensais + reserva para falhas.<br />
          Preço = o valor que, depois de taxas e impostos, deixa a sua margem (ou o multiplicador escolhido). O resultado é só uma sugestão: você decide o preço final.
        </div>
      </Card>

      <FormMessage error={state.error} ok={state.ok} />
      <SubmitButton pending={pending}>Salvar configurações</SubmitButton>
    </form>
  );
}
