"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { MATERIALS } from "@/features/filaments/schema";
import { cn, parseDecimal } from "@/lib/utils";
import { finishOnboarding, saveBusinessStep, saveCostStep, saveFilamentStep, saveMarginStep, savePrinterStep } from "./actions";
import { wearPerHour } from "./hourly";
import type { OnboardingState } from "./schema";

export interface WizardInitial {
  businessName: string;
  printer: { id: string; name: string; brand: string; model: string; power: number; hourlyCost: number; purchasePrice: number; lifespanHours: number } | null;
  filament: { id: string; material: string; color: string; pricePerKg: number } | null;
  margin: number;
}

const STEPS = [
  { key: "negocio", title: "Seu negócio", text: "Como seu negócio se chama? O nome aparece nos orçamentos em PDF." },
  { key: "impressora", title: "Sua impressora", text: "Qual impressora você usa? Informe a marca e o nome ou modelo. Se tiver mais de uma, comece pela principal." },
  { key: "custo", title: "Custo da hora da sua impressora", text: "Quanto custa fazer a sua impressora trabalhar por uma hora? O PrintUp calcula pelo preço dela e por quanto tempo ela dura." },
  { key: "filamento", title: "Seu filamento", text: "O material que você mais usa. Depois você cadastra os outros." },
  { key: "margem", title: "Sua margem de lucro", text: "O lucro que você quer ter sobre o preço de venda. Dá para mudar em cada cálculo." },
] as const;

const n = (s: string) => {
  const v = parseDecimal(s);
  return Number.isNaN(v) ? (s.trim() === "" ? 0 : NaN) : v;
};
const fmt = (v: number) => (v ? String(v).replace(".", ",") : "");

export function OnboardingWizard({ initial, redo }: { initial: WizardInitial; redo: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<Record<string, boolean>>({});

  const [businessName, setBusinessName] = useState(initial.businessName);
  const [printerId, setPrinterId] = useState<string | null>(initial.printer?.id ?? null);
  const [model, setModel] = useState(initial.printer?.model ?? "");
  const [brand, setBrand] = useState(initial.printer?.brand ?? "");
  const [mode, setMode] = useState<"direto" | "calcular">(initial.printer && initial.printer.hourlyCost > 0 && initial.printer.purchasePrice === 0 ? "direto" : "calcular");
  const [hourly, setHourly] = useState(fmt(initial.printer?.hourlyCost ?? 0));
  const [incEnergy, setIncEnergy] = useState(true);
  const [incWear, setIncWear] = useState(true);
  const [price, setPrice] = useState(fmt(initial.printer?.purchasePrice ?? 0));
  const [life, setLife] = useState(fmt(initial.printer?.lifespanHours ?? 0));
  const [power, setPower] = useState(fmt(initial.printer?.power ?? 0));
  const [filamentId, setFilamentId] = useState<string | null>(initial.filament?.id ?? null);
  const [material, setMaterial] = useState(initial.filament?.material ?? "PLA");
  const [color, setColor] = useState(initial.filament?.color ?? "");
  const [pricePerKg, setPricePerKg] = useState(fmt(initial.filament?.pricePerKg ?? 0));
  const [margin, setMargin] = useState(String(initial.margin).replace(".", ","));

  const wear = wearPerHour(Number.isNaN(n(price)) ? 0 : n(price), Number.isNaN(n(life)) ? 0 : n(life));
  const last = step === STEPS.length;
  const current = STEPS[step];

  const run = (key: string, call: () => Promise<OnboardingState>, then?: (r: OnboardingState) => void) =>
    start(async () => {
      setError(undefined);
      const r = await call();
      if (!r.ok) return setError(r.error ?? "Não foi possível salvar.");
      then?.(r);
      setDone((d) => ({ ...d, [key]: true }));
      setStep((s) => s + 1);
    });

  const save = () => {
    switch (current.key) {
      case "negocio": return run("negocio", () => saveBusinessStep({ businessName }));
      case "impressora": return run("impressora", () => savePrinterStep({ printerId, brand, model }), (r) => setPrinterId(r.id ?? null));
      case "custo":
        return run("custo", () => saveCostStep({ printerId, mode, hourlyCost: n(hourly), includesEnergy: incEnergy, includesWear: incWear, purchasePrice: n(price), lifespanHours: n(life), powerWatts: n(power) }));
      case "filamento": return run("filamento", () => saveFilamentStep({ filamentId, material, color: color || undefined, pricePerKg: n(pricePerKg) }), (r) => setFilamentId(r.id ?? null));
      case "margem": return run("margem", () => saveMarginStep({ marginPercent: n(margin) }));
    }
  };
  const skip = () => { setError(undefined); setStep((s) => s + 1); };
  const finish = () =>
    start(async () => {
      const r = await finishOnboarding();
      if (!r.ok) return setError(r.error);
      router.push("/");
      router.refresh();
    });

  return (
    <div className="mx-auto max-w-xl space-y-5" data-testid="onboarding">
      <div>
        <p className="text-sm font-medium text-accent-strong">{redo ? "Revisar configuração" : "Bem-vindo ao PrintUp"}</p>
        <h1 className="text-2xl font-bold tracking-tight">{last ? "Tudo pronto" : current.title}</h1>
        <p className="mt-1 text-sm text-muted">{last ? "Veja o que foi configurado. O que ficou para depois está listado abaixo." : current.text}</p>
      </div>

      <ol className="flex gap-1.5" aria-label={`Passo ${Math.min(step + 1, STEPS.length)} de ${STEPS.length}`}>
        {STEPS.map((s, i) => (
          <li key={s.key} className={cn("h-1.5 flex-1 rounded-full", i < step ? "bg-accent" : i === step && !last ? "bg-ink" : "bg-line")} />
        ))}
      </ol>
      {!last && <p className="text-xs text-muted">Passo {step + 1} de {STEPS.length}</p>}

      {!last && (
        <Card className="space-y-4">
          {current.key === "negocio" && (
            <Field label="Nome do negócio">
              <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Ex.: Oficina Aurora 3D" maxLength={120} autoFocus />
            </Field>
          )}
          {current.key === "impressora" && (
            <>
              <Field label="Marca da impressora" hint="Ex.: Bambu Lab, Creality, Prusa."><Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Bambu Lab" maxLength={40} autoFocus /></Field>
              <Field label="Nome ou modelo da impressora" hint="Ex.: A1 mini, Ender-3 V3 KE."><Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="A1 mini" maxLength={39} /></Field>
              {(brand.trim() || model.trim()) && <p className="text-sm text-muted">Vai aparecer como: <strong className="text-ink">{[brand.trim(), model.trim()].filter(Boolean).join(" ")}</strong></p>}
            </>
          )}
          {current.key === "custo" && (
            !printerId ? (
              <p className="text-sm text-muted" role="status">Cadastre a impressora no passo anterior para informar o custo da hora. Você também pode fazer isso depois em Impressoras.</p>
            ) : (
              <>
                <div role="radiogroup" aria-label="Como informar o custo" className="grid gap-2 sm:grid-cols-2">
                  {([["calcular", "Calcular pelo preço e vida útil da impressora", "Recomendado: o PrintUp faz a conta"], ["direto", "Já sei quanto custa a hora", "Informo o valor direto"]] as const).map(([m, t, d]) => (
                    <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)}
                      className={cn("min-h-14 rounded-xl border px-3 py-2 text-left", mode === m ? "border-accent bg-accent-soft" : "border-line bg-surface")}>
                      <span className="block text-sm font-semibold">{t}</span>
                      <span className="block text-xs text-muted">{d}</span>
                    </button>
                  ))}
                </div>
                <p className="text-sm text-muted">Escolha <strong className="text-ink">uma</strong> das duas formas. Na maioria dos casos, a primeira é a mais simples: você só precisa do preço da impressora e de quantas horas ela dura.</p>
                {mode === "direto" ? (
                  <>
                    <Field label="Custo da hora (R$/h)"><Input inputMode="decimal" value={hourly} onChange={(e) => setHourly(e.target.value)} placeholder="Ex.: 4,50" /></Field>
                    <div className="space-y-1">
                      <p className="text-xs text-muted">Marque o que esse valor já inclui, para o PrintUp não somar de novo:</p>
                      <Checkbox label="Energia elétrica" checked={incEnergy} onChange={(e) => setIncEnergy(e.target.checked)} />
                      <Checkbox label="Desgaste e manutenção" checked={incWear} onChange={(e) => setIncWear(e.target.checked)} />
                    </div>
                    {!incEnergy && <Field label="Potência média (W)" hint="Para calcular a energia."><Input inputMode="decimal" value={power} onChange={(e) => setPower(e.target.value)} /></Field>}
                  </>
                ) : (
                  <>
                    <Field label="Preço da impressora (R$)" hint="Quanto você pagou nela."><Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
                    <Field label="Vida útil da impressora (horas)" hint="Por quantas horas de impressão ela deve durar. Ex.: 5.000 h."><Input inputMode="decimal" value={life} onChange={(e) => setLife(e.target.value)} /></Field>
                    <Field label="Potência da impressora (W)" hint="Consumo médio de energia enquanto imprime. Serve para calcular a energia."><Input inputMode="decimal" value={power} onChange={(e) => setPower(e.target.value)} /></Field>
                    {wear > 0 && <p className="rounded-xl bg-accent-soft/50 px-3 py-2 text-sm" data-testid="desgaste-por-hora">Desgaste da impressora: <strong className="num">R$ {wear.toFixed(2).replace(".", ",")}</strong> por hora (preço ÷ vida útil).</p>}
                  </>
                )}
              </>
            )
          )}
          {current.key === "filamento" && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Tipo de filamento"><Select value={material} onChange={(e) => setMaterial(e.target.value)}>{MATERIALS.map((m) => <option key={m}>{m}</option>)}</Select></Field>
                <Field label="Cor (opcional)"><Input value={color} onChange={(e) => setColor(e.target.value)} maxLength={40} /></Field>
              </div>
              <Field label="Preço por kg (R$)"><Input inputMode="decimal" value={pricePerKg} onChange={(e) => setPricePerKg(e.target.value)} placeholder="Ex.: 120" /></Field>
            </>
          )}
          {current.key === "margem" && (
            <Field label="Margem de lucro padrão (%)" hint="Ex.: 30 significa que 30% do preço de venda é lucro."><Input inputMode="decimal" value={margin} onChange={(e) => setMargin(e.target.value)} /></Field>
          )}

          <FormMessage error={error} />
          <div className="flex flex-wrap gap-3">
            {!(current.key === "custo" && !printerId) && (
              <Button onClick={save} disabled={pending}>{pending ? "Salvando…" : step === STEPS.length - 1 ? "Salvar e concluir" : "Continuar"}</Button>
            )}
            <Button variant="ghost" onClick={skip} disabled={pending}>Pular este passo</Button>
          </div>
        </Card>
      )}

      {last && (
        <Card className="space-y-4">
          <ul className="space-y-2 text-sm">
            {([["negocio", "Nome do negócio", "/negocio"], ["impressora", "Impressora", "/impressoras"], ["custo", "Custo da hora", "/impressoras"], ["filamento", "Filamento", "/filamentos"], ["margem", "Margem padrão", "/configuracoes"]] as const).map(([k, label, href]) => (
              <li key={k} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                  <span className={cn("flex h-5 w-5 items-center justify-center rounded-full", done[k] ? "bg-ok text-white" : "bg-line text-muted")} aria-hidden="true">{done[k] ? <Check size={12} /> : null}</span>
                  {label} <span className="sr-only">{done[k] ? "configurado" : "ficou para depois"}</span>
                </span>
                {done[k] ? <span className="text-ok">Configurado</span> : <Link href={href} className="font-medium text-accent-strong underline">Completar depois</Link>}
              </li>
            ))}
          </ul>
          <FormMessage error={error} />
          <Button onClick={finish} disabled={pending}>{pending ? "Abrindo…" : "Ir para o painel"}</Button>
        </Card>
      )}

      {!last && (
        <button type="button" onClick={finish} disabled={pending} className="min-h-11 text-sm text-muted underline" data-testid="configurar-depois">
          Configurar tudo depois
        </button>
      )}
    </div>
  );
}
