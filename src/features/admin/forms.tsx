"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { LIMIT_LABEL, FEATURES } from "@/lib/billing/state";
import { useActionForm } from "@/lib/use-action-form";
import type { FormState } from "@/lib/forms";
import { createCoupon, endCourtesy, grantCourtesy, runMercadoPagoProbe, saveSettings, scheduleCancel, setCouponActive, updatePlan, type ProbeState } from "./actions";
import { LIMIT_KEYS } from "./schema";
import type { PlanRowAdmin } from "./server";

const reais = (cents: number | null) => (cents === null ? "" : (cents / 100).toFixed(2).replace(".", ","));

export function PlanForm({ plan }: { plan: PlanRowAdmin }) {
  const { state, onSubmit, pending } = useActionForm(updatePlan.bind(null, plan.code), {} as FormState);
  const fe = state.fieldErrors ?? {};
  const system = plan.code === "gratuito" || plan.code === "trial";
  return (
    <Card data-testid={`plano-${plan.code}`}>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{plan.name} <span className="text-sm font-normal text-muted">({plan.code})</span></h2>
          <span className="text-sm text-muted">{plan.subscribers} assinante{plan.subscribers === 1 ? "" : "s"} no plano</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nome" error={fe.name}><Input name="name" defaultValue={plan.name} required maxLength={60} /></Field>
          <Field label="Ordem na página de planos" error={fe.sortOrder}><Input name="sortOrder" inputMode="decimal" defaultValue={plan.sort_order} /></Field>
          <Field label="Descrição" className="sm:col-span-2" error={fe.description}><Textarea name="description" defaultValue={plan.description ?? ""} maxLength={300} rows={2} /></Field>
          <Field label="Preço mensal (R$)" error={fe.price} hint={system ? "Este plano não pode ter preço." : "Não altera assinaturas já contratadas."}><Input name="price" inputMode="decimal" defaultValue={reais(plan.price_cents)} readOnly={system} /></Field>
          <Field label="Preço anual (R$)" error={fe.priceYearly} hint="Em branco = sem plano anual."><Input name="priceYearly" inputMode="decimal" defaultValue={reais(plan.price_yearly_cents)} readOnly={system} /></Field>
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Limites <span className="font-normal text-muted">(em branco = ilimitado)</span></legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {LIMIT_KEYS.map((k) => (
              <Field key={k} label={LIMIT_LABEL[k] ?? k} error={fe[k]}><Input name={k} inputMode="numeric" defaultValue={plan.limits[k] ?? ""} /></Field>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="text-sm font-medium">Recursos liberados</legend>
          <div className="grid gap-x-4 sm:grid-cols-2">
            {Object.entries(FEATURES).map(([k, f]) => (
              <Checkbox key={k} name={`feat_${k}`} label={`${f.label}${f.available ? "" : " (em breve)"}`} defaultChecked={Boolean(plan.features[k])} />
            ))}
          </div>
        </fieldset>
        <div className="flex flex-wrap gap-x-6">
          <Checkbox name="isPublic" label="Aparece na página pública" defaultChecked={plan.is_public} />
          <Checkbox name="isActive" label="Disponível" defaultChecked={plan.is_active} />
          <Checkbox name="highlight" label="Destacar" defaultChecked={plan.highlight} />
        </div>
        <div className="rounded-xl bg-accent-soft/50 p-3 text-sm">
          <Checkbox name="confirmar" label={`Confirmo: limites e recursos passam a valer já para os ${plan.subscribers} assinante(s) deste plano.`} />
        </div>
        <FormMessage error={state.error} ok={state.ok} />
        <SubmitButton pending={pending}>Salvar plano</SubmitButton>
      </form>
    </Card>
  );
}

export function CouponForm({ plans }: { plans: { code: string; name: string }[] }) {
  const { state, onSubmit, pending } = useActionForm(createCoupon, {} as FormState);
  const fe = state.fieldErrors ?? {};
  return (
    <Card data-testid="novo-cupom">
      <form onSubmit={onSubmit} className="space-y-4">
        <h2 className="text-lg font-semibold">Novo cupom de acesso</h2>
        <p className="text-sm text-muted">Libera um plano por alguns dias, sem cobrança (teste grátis, cortesia ou convite). Descontos em dinheiro ainda não existem.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Código" error={fe.code} hint="4 a 32: letras, números, - ou _."><Input name="code" required maxLength={32} autoCapitalize="characters" /></Field>
          <Field label="Plano liberado" error={fe.planCode}><Select name="planCode" defaultValue={plans[0]?.code}>{plans.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}</Select></Field>
          <Field label="Dias de acesso" error={fe.days}><Input name="days" inputMode="numeric" defaultValue="14" /></Field>
          <Field label="Limite de usos" error={fe.maxRedemptions} hint="Em branco = sem limite."><Input name="maxRedemptions" inputMode="numeric" /></Field>
          <Field label="Válido a partir de" error={fe.validFrom}><Input name="validFrom" type="datetime-local" /></Field>
          <Field label="Válido até" error={fe.validUntil}><Input name="validUntil" type="datetime-local" /></Field>
          <Field label="Só para este e-mail (convite)" error={fe.restrictedEmail} hint="Em branco = qualquer pessoa com o código."><Input name="restrictedEmail" type="email" /></Field>
          <Field label="Descrição interna" error={fe.description}><Input name="description" maxLength={200} /></Field>
        </div>
        <FormMessage error={state.error} ok={state.ok} />
        <SubmitButton pending={pending}>Criar cupom</SubmitButton>
      </form>
    </Card>
  );
}

export function CouponToggle({ id, active }: { id: string; active: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string>();
  return (
    <span>
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => start(async () => { const r = await setCouponActive(id, !active); setErr(r.error); router.refresh(); })}>
        {active ? "Desativar" : "Ativar"}
      </Button>
      {err && <span role="alert" className="ml-2 text-xs text-danger">{err}</span>}
    </span>
  );
}

export function CourtesyForm({ userId, plans }: { userId: string; plans: { code: string; name: string }[] }) {
  const { state, onSubmit, pending } = useActionForm(grantCourtesy, {} as FormState);
  const fe = state.fieldErrors ?? {};
  return (
    <form onSubmit={onSubmit} className="space-y-3" data-testid="form-cortesia">
      <input type="hidden" name="userId" value={userId} />
      <h3 className="font-medium">Conceder cortesia</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Plano" error={fe.planCode}><Select name="planCode" defaultValue={plans[0]?.code}>{plans.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}</Select></Field>
        <Field label="Dias" error={fe.days}><Input name="days" inputMode="numeric" defaultValue="30" /></Field>
        <Field label="Motivo (fica na auditoria)" error={fe.reason}><Input name="reason" required maxLength={200} /></Field>
      </div>
      <FormMessage error={state.error} ok={state.ok} />
      <SubmitButton pending={pending} size="sm">Conceder</SubmitButton>
    </form>
  );
}

export function EndCourtesyForm({ userId }: { userId: string }) {
  const { state, onSubmit, pending } = useActionForm(endCourtesy, {} as FormState);
  return (
    <form onSubmit={onSubmit} className="space-y-3" data-testid="form-encerrar-cortesia">
      <input type="hidden" name="userId" value={userId} />
      <h3 className="font-medium">Encerrar teste/cortesia</h3>
      <Field label="Motivo" error={state.fieldErrors?.reason}><Input name="reason" required maxLength={200} /></Field>
      <FormMessage error={state.error} ok={state.ok} />
      <SubmitButton pending={pending} size="sm" variant="secondary">Encerrar agora</SubmitButton>
    </form>
  );
}

export function CancelForm({ userId }: { userId: string }) {
  const { state, onSubmit, pending } = useActionForm(scheduleCancel, {} as FormState);
  return (
    <form onSubmit={onSubmit} className="space-y-3" data-testid="form-cancelar">
      <input type="hidden" name="userId" value={userId} />
      <h3 className="font-medium">Cancelar assinatura paga no fim do período</h3>
      <p className="text-sm text-muted">Cancela a cobrança no gateway e mantém o plano até o fim do período já pago. Nenhum pagamento é alterado.</p>
      <Field label="Motivo" error={state.fieldErrors?.reason}><Input name="reason" required maxLength={200} /></Field>
      <Checkbox name="confirmar" label="Confirmo o cancelamento" />
      <FormMessage error={state.error} ok={state.ok} />
      <SubmitButton pending={pending} size="sm" variant="danger">Cancelar assinatura</SubmitButton>
    </form>
  );
}

export function SettingsForm({ values }: { values: { billing_grace_days: number; trial_enabled: boolean; support_email: string; terms_url: string; privacy_url: string } }) {
  const { state, onSubmit, pending } = useActionForm(saveSettings, {} as FormState);
  const fe = state.fieldErrors ?? {};
  return (
    <Card>
      <form onSubmit={onSubmit} className="space-y-4" data-testid="form-configuracoes">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Dias de carência após falha de pagamento" error={fe.billing_grace_days} hint="De 0 a 30. Depois disso o cliente volta aos limites do plano Gratuito (dados preservados)."><Input name="billing_grace_days" inputMode="numeric" defaultValue={values.billing_grace_days} /></Field>
          <div className="flex items-end"><Checkbox name="trial_enabled" label="Novos cadastros começam com teste grátis" defaultChecked={values.trial_enabled} /></div>
          <Field label="E-mail de suporte" error={fe.support_email}><Input name="support_email" type="email" defaultValue={values.support_email} /></Field>
          <span />
          <Field label="Link dos termos de uso (https)" error={fe.terms_url}><Input name="terms_url" defaultValue={values.terms_url} /></Field>
          <Field label="Link da política de privacidade (https)" error={fe.privacy_url}><Input name="privacy_url" defaultValue={values.privacy_url} /></Field>
        </div>
        <FormMessage error={state.error} ok={state.ok} />
        <SubmitButton pending={pending}>Salvar configurações</SubmitButton>
      </form>
    </Card>
  );
}

/** Botão "Testar conexão com o Mercado Pago": mostra o que ele aceita ou recusa (só conta de teste, sem segredos). */
export function ProbeButton() {
  const [state, setState] = useState<ProbeState>({});
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3" data-testid="teste-conexao-mp">
      <Button variant="secondary" disabled={pending} onClick={() => start(async () => setState(await runMercadoPagoProbe()))}>
        {pending ? "Testando…" : "Testar conexão com o Mercado Pago"}
      </Button>
      {state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      {state.lines && (
        <ul className="divide-y divide-line rounded-xl border border-line text-sm">
          {state.lines.map((l) => (
            <li key={l.label} className="flex flex-wrap justify-between gap-2 px-3 py-2">
              <span className="font-medium">{l.label}</span>
              <span className={l.ok ? "text-ok" : "text-danger"}>{l.ok ? "✓" : "✗"} {l.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
