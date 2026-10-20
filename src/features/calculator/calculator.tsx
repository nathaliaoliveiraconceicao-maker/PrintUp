"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { calculatePricing, pricingInputSchema } from "@/lib/pricing";
import type { SettingsRow } from "@/features/settings/schema";
import type { PrinterRow } from "@/features/printers/schema";
import type { FilamentRow } from "@/features/filaments/schema";
import { cn, formatBRL, formatPercent, parseDecimal } from "@/lib/utils";

const num = (s: string) => {
  const n = parseDecimal(s);
  return Number.isNaN(n) ? (s.trim() === "" ? 0 : NaN) : n;
};

const COST_LABELS: [string, string][] = [
  ["filament", "Filamento"],
  ["machineHour", "Hora da máquina"],
  ["energy", "Energia"],
  ["wear", "Desgaste e manutenção"],
  ["fixed", "Custos fixos (rateio)"],
  ["losses", "Perdas e desperdício"],
  ["labor", "Mão de obra"],
  ["packaging", "Embalagem e acabamento"],
];

export function Calculator({
  printers,
  filaments,
  settings,
}: {
  printers: PrinterRow[];
  filaments: FilamentRow[];
  settings: SettingsRow;
}) {
  const [printerId, setPrinterId] = useState(printers[0]?.id ?? "");
  const [filamentId, setFilamentId] = useState(filaments[0]?.id ?? "");
  const printer = printers.find((p) => p.id === printerId);
  const filament = filaments.find((f) => f.id === filamentId);

  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("");
  const [grams, setGrams] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [pricePerKg, setPricePerKg] = useState<string | null>(null); // null = usar o do filamento escolhido
  const [loss, setLoss] = useState(String(settings.loss_percent).replace(".", ","));
  const [laborMin, setLaborMin] = useState("0");
  const [setupMin, setSetupMin] = useState("0");
  const [laborRate, setLaborRate] = useState(String(settings.labor_hourly_rate).replace(".", ","));
  const [packaging, setPackaging] = useState("0");
  const [feePct, setFeePct] = useState(String(settings.sale_fee_percent).replace(".", ","));
  const [feeFixed, setFeeFixed] = useState(String(settings.sale_fee_fixed).replace(".", ","));
  const [taxPct, setTaxPct] = useState(String(settings.tax_percent).replace(".", ","));
  const [mode, setMode] = useState<"margin" | "markup">("margin");
  const [target, setTarget] = useState(String(settings.margin_percent).replace(".", ","));

  const effectivePricePerKg = pricePerKg ?? (filament ? String(filament.price_per_kg).replace(".", ",") : "");

  const { result, errors } = useMemo(() => {
    const draft = {
      quantity: Math.max(1, Math.floor(num(quantity) || 1)),
      printMinutesPerUnit: num(hours) * 60 + num(minutes),
      filamentGramsPerUnit: num(grams),
      filamentPricePerKg: num(effectivePricePerKg),
      machine: {
        hourlyCost: printer?.hourly_cost ?? 0,
        hourlyCostIncludes: {
          energy: printer?.hourly_includes_energy ?? false,
          wear: printer?.hourly_includes_wear ?? false,
          fixed: printer?.hourly_includes_fixed ?? false,
        },
        powerWatts: printer?.power_watts ?? 0,
        energyPricePerKwh: settings.energy_price_per_kwh,
        wearPerHour: printer?.wear_per_hour ?? 0,
      },
      fixedCosts: {
        monthlyTotal: settings.monthly_fixed_costs,
        allocation: settings.fixed_allocation,
        productiveHoursPerMonth: settings.productive_hours_per_month,
        monthlyUnits: settings.monthly_units,
      },
      lossPercent: num(loss),
      labor: { hourlyRate: num(laborRate), minutesPerUnit: num(laborMin), setupMinutesPerBatch: num(setupMin) },
      packagingPerUnit: num(packaging),
      sale: { feePercent: num(feePct), feeFixed: num(feeFixed), taxPercent: num(taxPct) },
      pricing:
        mode === "margin"
          ? { mode: "margin" as const, marginPercent: num(target) }
          : { mode: "markup" as const, markupPercent: num(target) },
    };
    const parsed = pricingInputSchema.safeParse(draft);
    if (!parsed.success) return { result: null, errors: parsed.error.issues.map((i) => i.message) };
    return { result: calculatePricing(parsed.data), errors: [] as string[] };
  }, [quantity, hours, minutes, grams, effectivePricePerKg, printer, settings, loss, laborRate, laborMin, setupMin, packaging, feePct, feeFixed, taxPct, mode, target]);

  const qty = Math.max(1, Math.floor(num(quantity) || 1));

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
      <div className="space-y-6 pb-28 lg:pb-0">
        <Card className="space-y-4">
          <h2 className="font-semibold">Peça</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Impressora">
              <Select value={printerId} onChange={(e) => setPrinterId(e.target.value)}>
                {printers.length === 0 && <option value="">Cadastre uma impressora</option>}
                {printers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
            <Field label="Filamento">
              <Select
                value={filamentId}
                onChange={(e) => { setFilamentId(e.target.value); setPricePerKg(null); }}
              >
                {filaments.length === 0 && <option value="">Cadastre um filamento</option>}
                {filaments.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 items-end gap-4 sm:grid-cols-4">
            <Field label="Tempo (h)"><Input inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="0" /></Field>
            <Field label="Tempo (min)"><Input inputMode="decimal" value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="0" /></Field>
            <Field label="Peso (g)" hint="Peça + suportes"><Input inputMode="decimal" value={grams} onChange={(e) => setGrams(e.target.value)} placeholder="0" /></Field>
            <Field label="Unidades"><Input inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></Field>
          </div>
          <p className="text-xs text-muted">Tempo e peso são de <strong>uma</strong> unidade; o lote multiplica pela quantidade.</p>
          <Field label="Preço do filamento (R$/kg)" hint="Preenchido pelo filamento escolhido; edite se precisar.">
            <Input inputMode="decimal" value={effectivePricePerKg} onChange={(e) => setPricePerKg(e.target.value)} />
          </Field>
        </Card>

        <Card className="space-y-4">
          <h2 className="font-semibold">Mão de obra, perdas e embalagem</h2>
          <div className="grid items-end gap-4 sm:grid-cols-3">
            <Field label="Mão de obra (min/unid.)"><Input inputMode="decimal" value={laborMin} onChange={(e) => setLaborMin(e.target.value)} /></Field>
            <Field label="Preparo do lote (min)"><Input inputMode="decimal" value={setupMin} onChange={(e) => setSetupMin(e.target.value)} /></Field>
            <Field label="Valor da hora (R$)"><Input inputMode="decimal" value={laborRate} onChange={(e) => setLaborRate(e.target.value)} /></Field>
            <Field label="Perdas (%)"><Input inputMode="decimal" value={loss} onChange={(e) => setLoss(e.target.value)} /></Field>
            <Field label="Embalagem (R$/unid.)"><Input inputMode="decimal" value={packaging} onChange={(e) => setPackaging(e.target.value)} /></Field>
          </div>
        </Card>

        <Card className="space-y-4">
          <h2 className="font-semibold">Venda</h2>
          <div className="grid items-end gap-4 sm:grid-cols-3">
            <Field label="Taxa de venda (%)"><Input inputMode="decimal" value={feePct} onChange={(e) => setFeePct(e.target.value)} /></Field>
            <Field label="Taxa fixa (R$)"><Input inputMode="decimal" value={feeFixed} onChange={(e) => setFeeFixed(e.target.value)} /></Field>
            <Field label="Impostos (%)"><Input inputMode="decimal" value={taxPct} onChange={(e) => setTaxPct(e.target.value)} /></Field>
          </div>
          <div role="radiogroup" aria-label="Método de preço" className="grid grid-cols-2 gap-2 rounded-xl bg-paper p-1">
            {(["margin", "markup"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                onClick={() => setMode(m)}
                className={cn("h-10 rounded-lg text-sm font-medium", mode === m ? "bg-surface shadow-sm" : "text-muted")}
              >
                {m === "margin" ? "Margem sobre o preço" : "Markup sobre o custo"}
              </button>
            ))}
          </div>
          <Field
            label={mode === "margin" ? "Margem de lucro (%)" : "Markup (%)"}
            hint={mode === "margin" ? "Lucro líquido como % do preço de venda." : "Acréscimo sobre o custo. Taxas e impostos saem do preço, então a margem real fica menor."}
          >
            <Input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} />
          </Field>
        </Card>

        <p className="text-xs text-muted">
          Custos fixos, energia e demais padrões vêm das <Link href="/configuracoes" className="underline">configurações</Link> e da impressora escolhida.
        </p>
      </div>

      {/* Resultado: coluna lateral no desktop, barra fixa no celular */}
      <aside className="lg:sticky lg:top-6 lg:self-start">
        <Card className="hidden space-y-4 lg:block">
          <ResultBody result={result} errors={errors} qty={qty} />
        </Card>
        <div className="fixed inset-x-0 bottom-16 z-10 border-t border-line bg-surface/95 px-5 py-3 backdrop-blur lg:hidden">
          <details>
            <summary className="flex cursor-pointer list-none items-center justify-between">
              <span className="text-sm text-muted">Preço sugerido / unid.</span>
              <span className="num text-2xl font-semibold text-accent-strong">
                {result ? formatBRL(result.suggestedUnitPrice) : "—"}
              </span>
            </summary>
            <div className="mt-3 max-h-[55dvh] space-y-4 overflow-y-auto pb-2">
              <ResultBody result={result} errors={errors} qty={qty} compact />
            </div>
          </details>
        </div>
      </aside>
    </div>
  );
}

function ResultBody({
  result,
  errors,
  qty,
  compact,
}: {
  result: ReturnType<typeof calculatePricing> | null;
  errors: string[];
  qty: number;
  compact?: boolean;
}) {
  if (!result) {
    return (
      <div className="space-y-2 text-sm text-danger" role="alert">
        {errors.length ? errors.map((m, i) => <p key={i}>{m}</p>) : <p>Preencha os dados para calcular.</p>}
      </div>
    );
  }
  return (
    <>
      {!compact && (
        <div>
          <p className="text-sm text-muted">Preço sugerido por unidade</p>
          <p className="num text-4xl font-semibold text-accent-strong">{formatBRL(result.suggestedUnitPrice)}</p>
        </div>
      )}
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <Stat label="Custo unitário" value={formatBRL(result.unitCost)} />
        <Stat label={`Custo do lote (${qty})`} value={formatBRL(result.batchCost)} />
        <Stat label="Lucro / unid." value={formatBRL(result.unitProfit)} tone="ok" />
        <Stat label="Lucro do lote" value={formatBRL(result.batchProfit)} tone="ok" />
        <Stat label="Margem (sobre o preço)" value={formatPercent(result.marginPercent)} />
        <Stat label="Markup (sobre o custo)" value={formatPercent(result.markupPercent)} />
        <Stat label="Taxas / unid." value={formatBRL(result.unitFees)} />
        <Stat label="Impostos / unid." value={formatBRL(result.unitTaxes)} />
      </dl>
      <div>
        <h3 className="mb-2 text-sm font-semibold">Custo por unidade</h3>
        <ul className="divide-y divide-line text-sm">
          {COST_LABELS.map(([key, label]) => {
            const value = result.unit[key as keyof typeof result.unit];
            return (
              <li key={key} className="flex justify-between py-1.5">
                <span className={value === 0 ? "text-muted" : ""}>{label}</span>
                <span className="num">{formatBRL(value)}</span>
              </li>
            );
          })}
        </ul>
      </div>
      {result.warnings.map((w) => (
        <p key={w.code} className="flex gap-2 rounded-xl bg-accent-soft px-3 py-2 text-xs text-warn">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          {w.message}
        </p>
      ))}
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "ok" }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={cn("num text-base font-medium", tone === "ok" && "text-ok")}>{value}</dd>
    </div>
  );
}

