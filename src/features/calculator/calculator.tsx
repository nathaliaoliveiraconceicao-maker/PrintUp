"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { applyDiscount, calculatePricing, costGroups, pricingInputSchema, type PricingInput } from "@/lib/pricing";
import { COST_LABELS } from "@/lib/pricing/labels";
import type { SettingsRow } from "@/features/settings/schema";
import type { PrinterRow } from "@/features/printers/schema";
import type { FilamentRow } from "@/features/filaments/schema";
import { SavePricing } from "./save-pricing";
import type { CalcProfile } from "./profile";
import { Tag } from "@/features/imports/provenance-tag";
import { comparePrinters, printerMatchMessage } from "@/features/imports/printer-match";
import { storedTag, type ProvenanceTag } from "@/features/imports/provenance";
import { valuesFromMinutes } from "@/features/imports/profile-values";
import { cn, formatBRL, formatPercent, parseDecimal } from "@/lib/utils";
import { CostChart } from "./cost-chart";

const num = (s: string) => {
  const n = parseDecimal(s);
  return Number.isNaN(n) ? (s.trim() === "" ? 0 : NaN) : n;
};

const fmt = (n: number) => String(n).replace(".", ",");

export function Calculator({
  printers,
  filaments,
  settings,
  products,
  profile = null,
  initialPrinterId,
  initialMode = "rapido",
}: {
  printers: PrinterRow[];
  filaments: FilamentRow[];
  settings: SettingsRow;
  products: { id: string; name: string }[];
  profile?: CalcProfile | null;
  initialPrinterId?: string;
  initialMode?: "rapido" | "avancado";
}) {
  const [printerId, setPrinterId] = useState(() => {
    if (initialPrinterId && printers.some((p) => p.id === initialPrinterId)) return initialPrinterId;
    const same = printers.filter((p) => comparePrinters(profile?.slicerPrinterName, p) === "igual");
    return same.length === 1 ? same[0].id : (printers[0]?.id ?? "");
  });
  // Material do arquivo => filamento: só pré-seleciona se houver UM filamento cadastrado com esse material (continua editável).
  const [filamentId, setFilamentId] = useState(() => {
    const type = profile?.filamentType?.trim().toLowerCase();
    const same = type && !type.includes("+") ? filaments.filter((f) => f.material.toLowerCase() === type) : [];
    return same.length === 1 ? same[0].id : (filaments[0]?.id ?? "");
  });
  const printer = printers.find((p) => p.id === printerId);
  const filament = filaments.find((f) => f.id === filamentId);

  const [hours, setHours] = useState(() => valuesFromMinutes(profile?.printMinutes ?? null).hours);
  const [minutes, setMinutes] = useState(() => valuesFromMinutes(profile?.printMinutes ?? null).minutes);
  const [grams, setGrams] = useState(() => (profile?.weightG != null ? String(profile.weightG).replace(".", ",") : ""));
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

  const [uiMode, setUiMode] = useState<"rapido" | "avancado">(initialMode);
  const advanced = uiMode === "avancado";
  // Ajustes avançados da máquina e dos custos fixos: ausente = usa o da impressora / das configurações.
  const [ov, setOv] = useState<{ power?: string; wear?: string; energy?: string; hourly?: string; fixed?: string }>({});
  const [finishing, setFinishing] = useState("0");
  const [discount, setDiscount] = useState("0");

  const effectivePricePerKg = pricePerKg ?? (filament ? String(filament.price_per_kg).replace(".", ",") : "");

  const { result, errors, input } = useMemo(() => {
    const draft = {
      quantity: Math.max(1, Math.floor(num(quantity) || 1)),
      printMinutesPerUnit: num(hours) * 60 + num(minutes),
      filamentGramsPerUnit: num(grams),
      filamentPricePerKg: num(effectivePricePerKg),
      machine: {
        hourlyCost: num(ov.hourly ?? fmt(printer?.hourly_cost ?? 0)),
        hourlyCostIncludes: {
          energy: printer?.hourly_includes_energy ?? false,
          wear: printer?.hourly_includes_wear ?? false,
          fixed: printer?.hourly_includes_fixed ?? false,
        },
        powerWatts: num(ov.power ?? fmt(printer?.power_watts ?? 0)),
        energyPricePerKwh: num(ov.energy ?? fmt(settings.energy_price_per_kwh)),
        wearPerHour: num(ov.wear ?? fmt(printer?.wear_per_hour ?? 0)),
      },
      fixedCosts: {
        monthlyTotal: num(ov.fixed ?? fmt(settings.monthly_fixed_costs)),
        allocation: settings.fixed_allocation,
        productiveHoursPerMonth: settings.productive_hours_per_month,
        monthlyUnits: settings.monthly_units,
      },
      lossPercent: num(loss),
      labor: { hourlyRate: num(laborRate), minutesPerUnit: num(laborMin), setupMinutesPerBatch: num(setupMin) },
      // Embalagem e acabamento somam num único custo por unidade (é como o motor os trata).
      packagingPerUnit: num(packaging) + num(finishing),
      sale: { feePercent: num(feePct), feeFixed: num(feeFixed), taxPercent: num(taxPct) },
      pricing:
        mode === "margin"
          ? { mode: "margin" as const, marginPercent: num(target) }
          : { mode: "markup" as const, markupPercent: num(target) },
    };
    const parsed = pricingInputSchema.safeParse(draft);
    if (!parsed.success) return { result: null, input: null, errors: parsed.error.issues.map((i) => i.message) };
    return { result: calculatePricing(parsed.data), input: parsed.data, errors: [] as string[] };
  }, [quantity, hours, minutes, grams, effectivePricePerKg, printer, settings, ov, loss, laborRate, laborMin, setupMin, packaging, finishing, feePct, feeFixed, taxPct, mode, target]);

  const qty = Math.max(1, Math.floor(num(quantity) || 1));
  const discountPct = advanced ? Math.min(100, Math.max(0, num(discount) || 0)) : 0;

  // Origem dos dados vindos do perfil: "do arquivo" só enquanto o valor não for alterado aqui.
  const currentWeight = parseDecimal(grams);
  const currentMinutes = (parseDecimal(hours) || 0) * 60 + (parseDecimal(minutes) || 0);
  const same = (a: number, b: number) => Math.abs(a - b) < 0.005;
  const weightTag: ProvenanceTag | null = profile
    ? profile.weightG === null
      ? Number.isNaN(currentWeight) ? "em branco" : "informado por você"
      : !Number.isNaN(currentWeight) && same(profile.weightG, currentWeight)
        ? storedTag(true, profile.weightOrigin, profile.editedFields.includes("weight"))
        : "editado"
    : null;
  const timeTag: ProvenanceTag | null = profile
    ? profile.printMinutes === null
      ? currentMinutes > 0 ? "informado por você" : "em branco"
      : same(profile.printMinutes, currentMinutes)
        ? storedTag(true, profile.timeOrigin, profile.editedFields.includes("time"))
        : "editado"
    : null;
  const printerWarning = profile ? printerMatchMessage(comparePrinters(profile.slicerPrinterName, printer), profile.slicerPrinterName, printer?.name) : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
      <div className="space-y-6 pb-28 lg:pb-0">
        <div role="radiogroup" aria-label="Modo da calculadora" className="grid grid-cols-2 gap-1 rounded-2xl border border-line bg-surface p-1" data-testid="modo-calculadora">
          {([["rapido", "Modo rápido", "Só o essencial"], ["avancado", "Modo avançado", "Todos os custos"]] as const).map(([m, label, hint]) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={uiMode === m}
              onClick={() => setUiMode(m)}
              className={cn("min-h-12 rounded-xl px-3 text-left transition-colors", uiMode === m ? "bg-ink text-paper" : "text-muted hover:text-ink")}
            >
              <span className="block text-sm font-semibold">{label}</span>
              <span className="block text-xs opacity-75">{hint}</span>
            </button>
          ))}
        </div>

        <Card className="space-y-4">
          <h2 className="font-semibold">Peça</h2>
          {profile && (
            <div className="space-y-2 rounded-xl border border-import/30 bg-import-soft/40 p-3 text-sm" data-testid="perfil-banner">
              <div className="flex items-start gap-3">
                {profile.thumbUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.thumbUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg border border-line bg-surface object-contain" />
                )}
                <p>
                  Dados do perfil <strong>“{profile.name}”</strong> do modelo <strong>“{profile.modelTitle}”</strong>.{" "}
                  <Link href={`/importar/${profile.modelId}`} className="font-medium text-import underline">Ver ficha</Link>
                </p>
              </div>
              {(profile.filamentType || profile.pieceCount || profile.slicerPrinterName) && (
                <p className="text-xs text-muted">
                  {[profile.filamentType && `Material: ${profile.filamentType}`, profile.pieceCount && `${profile.pieceCount} peça(s) na placa`, profile.slicerPrinterName && `Fatiado para: ${profile.slicerPrinterName}`]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
              <p className="text-xs text-muted">Edite qualquer valor abaixo: a etiqueta mostra o que veio do arquivo e o que foi alterado.</p>
              {printerWarning && (
                <p role="alert" className="flex gap-2 rounded-lg bg-accent-soft px-3 py-2 text-warn">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {printerWarning}
                </p>
              )}
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Impressora">
              <Select value={printerId} onChange={(e) => { setPrinterId(e.target.value); setOv({}); }}>
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
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Field label="Horas" tag={timeTag ? <Tag value={timeTag} /> : undefined}><Input inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="0" /></Field>
            <Field label="Minutos"><Input inputMode="decimal" value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="0" /></Field>
            <Field label="Peso (g)" tag={weightTag ? <Tag value={weightTag} /> : undefined}><Input inputMode="decimal" value={grams} onChange={(e) => setGrams(e.target.value)} placeholder="0" /></Field>
            <Field label="Unidades"><Input inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></Field>
          </div>
          <p className="text-xs text-muted">Tempo e peso (com suportes) são de <strong>uma</strong> unidade; o lote multiplica pela quantidade.</p>
          {advanced && (
            <Field label="Preço do filamento (R$/kg)" hint="Preenchido pelo filamento escolhido; edite se precisar.">
              <Input inputMode="decimal" value={effectivePricePerKg} onChange={(e) => setPricePerKg(e.target.value)} />
            </Field>
          )}
          {!advanced && (
            <Field
              label={mode === "margin" ? "Margem de lucro (%)" : "Markup (%)"}
              hint={mode === "margin" ? "Lucro líquido como % do preço de venda." : "Acréscimo sobre o custo (definido no modo avançado)."}
            >
              <Input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} />
            </Field>
          )}
        </Card>

        {!advanced && (
          <Card className="space-y-2 bg-paper text-sm" data-testid="padroes-rapido">
            <p className="font-medium">Seus padrões já estão aplicados</p>
            <p className="text-muted">
              Perdas {formatPercent(num(loss) || 0)} · taxas {formatPercent(num(feePct) || 0)} · impostos {formatPercent(num(taxPct) || 0)} · energia {formatBRL(settings.energy_price_per_kwh)}/kWh
              {printer ? ` · ${printer.name}` : ""}.
            </p>
            <button type="button" className="min-h-11 font-medium text-accent-strong underline" onClick={() => setUiMode("avancado")}>
              Ajustar custos no modo avançado
            </button>
          </Card>
        )}

        {advanced && (
          <>
            <Card className="space-y-4" data-testid="avancado-maquina">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">Impressora, energia e custos fixos</h2>
                  <p className="mt-1 text-xs text-muted">Valores da impressora e das configurações. Mudar aqui vale só para este cálculo.</p>
                </div>
                {Object.keys(ov).length > 0 && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setOv({})}>Voltar aos padrões</Button>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Custo da hora da máquina (R$/h)" hint={printer && (printer.hourly_includes_energy || printer.hourly_includes_wear || printer.hourly_includes_fixed) ? "Já inclui " + [printer.hourly_includes_energy && "energia", printer.hourly_includes_wear && "desgaste", printer.hourly_includes_fixed && "custos fixos"].filter(Boolean).join(", ") + ": esses itens não são somados de novo." : "Se informar, confira o que ele já inclui na impressora."}>
                  <Input inputMode="decimal" value={ov.hourly ?? fmt(printer?.hourly_cost ?? 0)} onChange={(e) => setOv({ ...ov, hourly: e.target.value })} />
                </Field>
                <Field label="Depreciação + manutenção (R$/h)" hint="Desgaste da máquina por hora de impressão.">
                  <Input inputMode="decimal" value={ov.wear ?? fmt(printer?.wear_per_hour ?? 0)} onChange={(e) => setOv({ ...ov, wear: e.target.value })} />
                </Field>
                <Field label="Potência (W)">
                  <Input inputMode="decimal" value={ov.power ?? fmt(printer?.power_watts ?? 0)} onChange={(e) => setOv({ ...ov, power: e.target.value })} />
                </Field>
                <Field label="Energia (R$/kWh)">
                  <Input inputMode="decimal" value={ov.energy ?? fmt(settings.energy_price_per_kwh)} onChange={(e) => setOv({ ...ov, energy: e.target.value })} />
                </Field>
                <Field label="Custos fixos mensais (R$)" hint="Rateados pelas horas produtivas ou pelas peças, conforme suas configurações.">
                  <Input inputMode="decimal" value={ov.fixed ?? fmt(settings.monthly_fixed_costs)} onChange={(e) => setOv({ ...ov, fixed: e.target.value })} />
                </Field>
              </div>
            </Card>

            <Card className="space-y-4">
              <h2 className="font-semibold">Mão de obra, perdas, embalagem e acabamento</h2>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Mão de obra (min)"><Input inputMode="decimal" value={laborMin} onChange={(e) => setLaborMin(e.target.value)} /></Field>
                <Field label="Preparo (min)"><Input inputMode="decimal" value={setupMin} onChange={(e) => setSetupMin(e.target.value)} /></Field>
                <Field label="Valor da hora (R$)"><Input inputMode="decimal" value={laborRate} onChange={(e) => setLaborRate(e.target.value)} /></Field>
                <Field label="Perdas (%)"><Input inputMode="decimal" value={loss} onChange={(e) => setLoss(e.target.value)} /></Field>
                <Field label="Embalagem (R$/unid.)"><Input inputMode="decimal" value={packaging} onChange={(e) => setPackaging(e.target.value)} /></Field>
                <Field label="Acabamento (R$/unid.)" hint="Lixa, tinta, colagem… soma com a embalagem."><Input inputMode="decimal" value={finishing} onChange={(e) => setFinishing(e.target.value)} /></Field>
              </div>
            </Card>

            <Card className="space-y-4">
              <h2 className="font-semibold">Venda, margem e desconto</h2>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Taxa (%)"><Input inputMode="decimal" value={feePct} onChange={(e) => setFeePct(e.target.value)} /></Field>
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
                    className={cn("min-h-11 rounded-lg text-sm font-medium", mode === m ? "bg-surface shadow-sm" : "text-muted")}
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
              <Field label="Desconto ao cliente (%) — simulação" hint="Mostra o efeito no lucro ao lado do resultado. Não muda o preço sugerido nem o que é salvo.">
                <Input inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} />
              </Field>
            </Card>
          </>
        )}

        <p className="text-xs text-muted">
          Custos fixos, energia e demais padrões vêm das <Link href="/configuracoes" className="underline">configurações</Link> e da impressora escolhida.
        </p>

        <SavePricing
          products={products}
          input={input}
          printerId={printer?.id}
          filamentId={filament?.id}
          profileId={profile?.id}
          defaultName={profile?.modelTitle}
        />
      </div>

      {/* Resultado: coluna lateral no desktop, barra fixa no celular */}
      <aside className="lg:sticky lg:top-6 lg:self-start">
        <Card className="hidden space-y-4 lg:block">
          <ResultBody result={result} errors={errors} qty={qty} discountPct={discountPct} sale={input?.sale ?? null} />
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
              <ResultBody result={result} errors={errors} qty={qty} discountPct={discountPct} sale={input?.sale ?? null} compact />
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
  discountPct,
  sale,
  compact,
}: {
  result: ReturnType<typeof calculatePricing> | null;
  errors: string[];
  qty: number;
  discountPct: number;
  sale: PricingInput["sale"] | null;
  compact?: boolean;
}) {
  if (!result) {
    return (
      <div className="space-y-2 text-sm text-danger" role="alert">
        {errors.length ? errors.map((m, i) => <p key={i}>{m}</p>) : <p>Preencha os dados para calcular.</p>}
      </div>
    );
  }
  const g = costGroups(result.unit, result.unitCost);
  const disc = sale && discountPct > 0 ? applyDiscount(result.unitCost, result.suggestedUnitPrice, sale, discountPct) : null;
  return (
    <>
      {!compact && (
        <div className="rounded-2xl bg-ink p-4 text-paper" data-testid="preco-sugerido">
          <p className="text-sm opacity-75">Preço sugerido por unidade</p>
          <p className="num text-4xl font-semibold text-white">{formatBRL(result.suggestedUnitPrice)}</p>
          <p className="mt-1 text-xs opacity-75">
            Lucro {formatBRL(result.unitProfit)} · margem {formatPercent(result.marginPercent)}
          </p>
        </div>
      )}
      {disc && (
        <div className={cn("rounded-xl border px-3 py-2 text-sm", disc.belowCost ? "border-danger/40 bg-danger/10 text-danger" : "border-line bg-paper")} data-testid="simulacao-desconto" role={disc.belowCost ? "alert" : undefined}>
          <p className="font-medium">Com {formatPercent(discountPct)} de desconto</p>
          <p className="num">{formatBRL(disc.price)} · lucro {formatBRL(disc.profit)} · margem {formatPercent(disc.marginPercent)}</p>
          {disc.belowCost && <p className="text-xs">Atenção: neste preço você não cobre custo, taxas e impostos.</p>}
        </div>
      )}
      <div>
        <h3 className="mb-2 text-sm font-semibold">Composição do custo</h3>
        <CostChart unit={result.unit} unitCost={result.unitCost} />
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <Stat label="Custo do filamento" value={formatBRL(g.filament)} />
        <Stat label="Custo da impressora" value={formatBRL(g.printer)} />
        <Stat label="Custos adicionais" value={formatBRL(g.additional)} />
        <Stat label="Custo unitário" value={formatBRL(result.unitCost)} />
        <Stat label={`Custo do lote (${qty})`} value={formatBRL(result.batchCost)} />
        <Stat label="Lucro / unid." value={formatBRL(result.unitProfit)} tone="ok" />
        <Stat label="Lucro do lote" value={formatBRL(result.batchProfit)} tone="ok" />
        <Stat label="Margem (sobre o preço)" value={formatPercent(result.marginPercent)} />
        <Stat label="Markup (sobre o custo)" value={formatPercent(result.markupPercent)} />
        <Stat label="Taxas / unid." value={formatBRL(result.unitFees)} />
        <Stat label="Impostos / unid." value={formatBRL(result.unitTaxes)} />
      </dl>
      <details className="text-sm">
        <summary className="min-h-11 cursor-pointer py-2 font-medium text-accent-strong">Ver custo item a item</summary>
        <ul className="divide-y divide-line">
          {COST_LABELS.map(([key, label]) => {
            const value = result.unit[key];
            return (
              <li key={key} className="flex justify-between py-1.5">
                <span className={value === 0 ? "text-muted" : ""}>{label}</span>
                <span className="num">{formatBRL(value)}</span>
              </li>
            );
          })}
        </ul>
      </details>
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

