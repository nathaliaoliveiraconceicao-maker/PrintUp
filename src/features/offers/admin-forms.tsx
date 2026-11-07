"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import type { FormState } from "@/lib/forms";
import { useActionForm } from "@/lib/use-action-form";
import { importFeed, reviewOffer, runSourceNow, saveConversion, saveCoupon, saveOfferSettings, saveSource, saveStore, setCouponActive, deleteSource, type ReviewAction } from "./admin-actions";
import { DEFAULT_WEIGHTS } from "./score";
import type { Source, Store } from "./repo";

const W_LABEL: Record<string, string> = { discount: "Desconto comprovado", history: "Preço vs. histórico", relevance: "Relevância para 3D", availability: "Disponibilidade", store: "Confiabilidade da loja", quality: "Qualidade dos dados", coupon: "Cupom válido", freshness: "Atualização recente" };

export function OfferSettingsForm({ s }: { s: Record<string, unknown> }) {
  const { state, onSubmit, pending } = useActionForm(saveOfferSettings, {} as FormState);
  const fe = state.fieldErrors ?? {};
  const w = { ...DEFAULT_WEIGHTS, ...((s.weights as Record<string, number>) ?? {}) } as Record<string, number>;
  return (
    <form onSubmit={onSubmit} className="space-y-4" data-testid="form-config-ofertas">
      <Card className="space-y-4">
        <h2 className="font-semibold">Publicação e pontuação</h2>
        <div className="rounded-xl bg-accent-soft px-3 py-3 text-sm text-warn">
          <Checkbox name="autoPublish" label="Publicar automaticamente as ofertas que passarem da nota mínima" defaultChecked={s.auto_publish === true} />
          <p className="mt-1">Mantenha <strong>desligado</strong> até conferir os conectores. Desligado, toda oferta espera a sua aprovação.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Nota mínima para publicar (0–100)" error={fe.minScorePublish}><Input name="minScorePublish" inputMode="numeric" defaultValue={String(s.min_score_publish ?? 75)} /></Field>
          <Field label="Nota mínima para revisão" error={fe.minScoreReview} hint="Abaixo disso a oferta é descartada."><Input name="minScoreReview" inputMode="numeric" defaultValue={String(s.min_score_review ?? 45)} /></Field>
          <Field label="Expirar após (horas sem verificar)" error={fe.expireAfterHours}><Input name="expireAfterHours" inputMode="numeric" defaultValue={String(s.expire_after_hours ?? 72)} /></Field>
          <Field label="Janela do histórico (dias)" error={fe.historyWindowDays}><Input name="historyWindowDays" inputMode="numeric" defaultValue={String(s.history_window_days ?? 90)} /></Field>
        </div>
        <fieldset className="space-y-2"><legend className="text-sm font-medium">Pesos dos critérios <span className="font-normal text-muted">(proporcionais; a soma não precisa ser 100)</span></legend>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Object.keys(W_LABEL).map((k) => <Field key={k} label={W_LABEL[k]} error={fe[`w_${k}`]}><Input name={`w_${k}`} inputMode="numeric" defaultValue={String(w[k])} /></Field>)}
          </div>
        </fieldset>
        <FormMessage error={state.error} ok={state.ok} />
        <SubmitButton pending={pending}>Salvar configurações</SubmitButton>
      </Card>
    </form>
  );
}

export function ReviewButtons({ id, actions }: { id: string; actions: ReviewAction[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<FormState>({});
  const LABEL: Record<ReviewAction, string> = { aprovar: "Aprovar e publicar", rejeitar: "Rejeitar", despublicar: "Despublicar", destacar: "Destacar", remover_destaque: "Remover destaque" };
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => <Button key={a} size="sm" variant={a === "aprovar" ? "primary" : a === "rejeitar" || a === "despublicar" ? "danger" : "secondary"} disabled={pending} data-testid={`acao-${a}`} onClick={() => start(async () => { setMsg(await reviewOffer(id, a)); router.refresh(); })}>{LABEL[a]}</Button>)}
      </div>
      {msg.error && <p role="alert" className="text-xs text-danger">{msg.error}</p>}
    </div>
  );
}

export function StoreForm({ store }: { store?: Store }) {
  const action = (_: FormState, fd: FormData) => saveStore(store?.id ?? null, _, fd);
  const { state, onSubmit, pending } = useActionForm(action, {} as FormState);
  const fe = state.fieldErrors ?? {};
  const cfg = store?.affiliateConfig ?? {};
  return (
    <form onSubmit={onSubmit} className="space-y-3" data-testid={store ? "form-loja" : "form-nova-loja"}>
      <Card className="space-y-3">
        <h3 className="font-semibold">{store ? store.name : "Nova loja"}</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Código (único)" error={fe.code}><Input name="code" defaultValue={store?.code} readOnly={Boolean(store)} required /></Field>
          <Field label="Nome" error={fe.name}><Input name="name" defaultValue={store?.name} required /></Field>
          <Field label="Tipo" error={fe.kind}><Select name="kind" defaultValue={store?.kind ?? "afiliado"}><option value="afiliado">Afiliado</option><option value="feed">Feed autorizado</option><option value="manual">Manual</option></Select></Field>
          <Field label="Confiabilidade (0–100)" error={fe.reliability}><Input name="reliability" inputMode="numeric" defaultValue={store?.reliability ?? 60} /></Field>
          <Field label="Domínios permitidos (um por linha)" className="sm:col-span-2" error={fe.hosts} hint="Os links só podem apontar para estes domínios."><Textarea name="hosts" rows={3} defaultValue={store?.allowedHosts.join("\n")} required /></Field>
          <Field label="Parâmetros do seu link de afiliado (nome=valor, um por linha)" className="sm:col-span-2" error={fe.params} hint="Copie do portal de afiliados da loja. Não invente."><Textarea name="params" rows={3} defaultValue={Object.entries(cfg.params ?? {}).map(([k, v]) => `${k}=${v}`).join("\n")} /></Field>
          <Field label="Parâmetros obrigatórios no link (separe por vírgula)" error={fe.required}><Input name="required" defaultValue={(cfg.requiredParams ?? []).join(", ")} /></Field>
          <Field label="Modelo de rastreador (opcional, com {url})" error={fe.template}><Input name="template" defaultValue={cfg.template ?? ""} /></Field>
          <Field label="Aviso de afiliado exibido ao público" className="sm:col-span-2" error={fe.disclosure}><Input name="disclosure" maxLength={300} defaultValue={store?.disclosure ?? ""} placeholder="Link de afiliado: o PrintUp pode receber uma comissão…" /></Field>
        </div>
        <Checkbox name="isActive" label="Loja ativa (ofertas dela aparecem ao público)" defaultChecked={store?.isActive ?? false} />
        <FormMessage error={state.error} ok={state.ok} />
        <SubmitButton pending={pending} size="sm">Salvar loja</SubmitButton>
      </Card>
    </form>
  );
}

export function SourceForm({ stores, source, connectors }: { stores: Store[]; source?: Source; connectors: { id: string; label: string; status: string; missing: string[] }[] }) {
  const action = (_: FormState, fd: FormData) => saveSource(source?.id ?? null, _, fd);
  const { state, onSubmit, pending } = useActionForm(action, {} as FormState);
  const fe = state.fieldErrors ?? {};
  return (
    <form onSubmit={onSubmit} className="space-y-3" data-testid={source ? "form-fonte" : "form-nova-fonte"}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Loja" error={fe.storeId}><Select name="storeId" defaultValue={source?.storeId ?? stores[0]?.id}>{stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        <Field label="Conector" error={fe.connector}><Select name="connector" defaultValue={source?.connector ?? "feed_manual"}>{connectors.map((c) => <option key={c.id} value={c.id}>{c.label}{c.missing.length ? " — faltam variáveis" : ""}</option>)}</Select></Field>
        <Field label="Nome da fonte" error={fe.name}><Input name="name" defaultValue={source?.name} required /></Field>
        <Field label="Frequência (min, mín. 60)" error={fe.frequencyMinutes} hint="No plano gratuito do Vercel a rotina roda 1 vez por dia."><Input name="frequencyMinutes" inputMode="numeric" defaultValue={source?.frequencyMinutes ?? 1440} /></Field>
        <Field label="Configuração (JSON, sem senhas)" className="sm:col-span-2 lg:col-span-4" error={fe.config} hint='Feed: {"feedUrl":"https://…"} · Shopee: {"keywords":["filamento pla"]} · Mercado Livre: {"itemIds":["MLB123…"],"affiliateLinks":{"MLB123…":"https://…"}}'><Textarea name="config" rows={3} defaultValue={JSON.stringify(source?.config ?? {}, null, 1)} /></Field>
      </div>
      <Checkbox name="isActive" label="Fonte ativa (roda na rotina agendada)" defaultChecked={source?.isActive ?? false} />
      <Checkbox name="confirmUnverified" label="Confirmo que li a documentação oficial e tenho autorização do programa (obrigatório para Shopee e Mercado Livre)" />
      <FormMessage error={state.error} ok={state.ok} />
      <SubmitButton pending={pending} size="sm">Salvar fonte</SubmitButton>
    </form>
  );
}

export function RunButtons({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<FormState>({});
  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" disabled={pending} data-testid="executar-agora" onClick={() => start(async () => { setMsg({}); setMsg(await runSourceNow(id)); router.refresh(); })}>{pending ? "Executando…" : "Executar agora"}</Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => { if (confirm("Remover esta fonte? As ofertas já criadas continuam.")) start(async () => { setMsg(await deleteSource(id)); router.refresh(); }); }}>Remover</Button>
      </div>
      {msg.error && <p role="alert" className="text-xs text-danger">{msg.error}</p>}
      {msg.ok && <p role="status" className="text-xs text-ok" data-testid="resultado-execucao">{msg.ok}</p>}
    </div>
  );
}

export function ImportForm({ sources }: { sources: Source[] }) {
  const { state, onSubmit, pending } = useActionForm(importFeed, {} as FormState);
  return (
    <form onSubmit={onSubmit} className="space-y-3" data-testid="form-importar-feed">
      <Card className="space-y-3">
        <h3 className="font-semibold">Importar produtos (CSV ou JSON)</h3>
        <p className="text-sm text-muted">Cole a exportação do seu portal de afiliados ou de um feed autorizado. Colunas: <code>titulo</code>, <code>preco</code>, <code>url</code> (obrigatórias) e, se tiver, <code>marca</code>, <code>modelo</code>, <code>imagem</code>, <code>preco_de</code> (só se a loja informar), <code>estoque</code>, <code>frete</code>, <code>link_afiliado</code>, <code>cupom</code>.</p>
        <Field label="Fonte"><Select name="sourceId">{sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        <Field label="Conteúdo"><Textarea name="text" rows={6} placeholder="titulo;preco;url;marca&#10;Filamento PLA 1kg;69,90;https://…;Marca" /></Field>
        <FormMessage error={state.error} ok={state.ok} />
        <SubmitButton pending={pending} size="sm">Importar</SubmitButton>
      </Card>
    </form>
  );
}

export function CouponForm({ stores }: { stores: Store[] }) {
  const { state, onSubmit, pending } = useActionForm(saveCoupon, {} as FormState);
  const fe = state.fieldErrors ?? {};
  return (
    <form onSubmit={onSubmit} className="space-y-3" data-testid="form-cupom-oferta">
      <Card className="space-y-3">
        <h3 className="font-semibold">Novo cupom</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Loja" error={fe.storeId}><Select name="storeId">{stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
          <Field label="Código" error={fe.code}><Input name="code" required /></Field>
          <Field label="Tipo" error={fe.kind}><Select name="kind"><option value="percent">Percentual (%)</option><option value="fixed">Valor fixo (R$)</option></Select></Field>
          <Field label="Valor" error={fe.value}><Input name="value" inputMode="decimal" required /></Field>
          <Field label="Compra mínima (R$)" error={fe.minPurchase}><Input name="minPurchase" inputMode="decimal" /></Field>
          <Field label="Desconto máximo (R$)" error={fe.maxDiscount}><Input name="maxDiscount" inputMode="decimal" /></Field>
          <Field label="Válido até" error={fe.validUntil}><Input name="validUntil" type="date" /></Field>
          <Field label="Origem do cupom" error={fe.source} hint="De onde veio (obrigatório)."><Input name="source" required /></Field>
        </div>
        <FormMessage error={state.error} ok={state.ok} />
        <SubmitButton pending={pending} size="sm">Salvar cupom</SubmitButton>
      </Card>
    </form>
  );
}

export function CouponToggle({ id, active }: { id: string; active: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => { await setCouponActive(id, !active); router.refresh(); })}>{active ? "Desativar" : "Ativar"}</Button>;
}

export function ConversionForm({ stores }: { stores: { id: string; name: string }[] }) {
  const { state, onSubmit, pending } = useActionForm(saveConversion, {} as FormState);
  const fe = state.fieldErrors ?? {};
  return (
    <form onSubmit={onSubmit} className="space-y-3" data-testid="form-conversao">
      <Card className="space-y-3">
        <h3 className="font-semibold">Registrar resultado do programa de afiliados</h3>
        <p className="text-sm text-muted">Digite o que o <strong>relatório da loja</strong> mostra. “Informada” = ainda pode ser cancelada; só marque “confirmada” quando a comissão estiver aprovada ou paga pelo programa.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Loja" error={fe.storeId}><Select name="storeId">{stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
          <Field label="Data do relatório" error={fe.reportedOn}><Input name="reportedOn" type="date" required /></Field>
          <Field label="Pedidos" error={fe.orders}><Input name="orders" inputMode="numeric" defaultValue="0" /></Field>
          <Field label="Comissão (R$)" error={fe.commission}><Input name="commission" inputMode="decimal" defaultValue="0" /></Field>
          <Field label="Situação" error={fe.status}><Select name="status"><option value="informada">Informada</option><option value="confirmada">Confirmada</option></Select></Field>
        </div>
        <FormMessage error={state.error} ok={state.ok} />
        <SubmitButton pending={pending} size="sm">Registrar</SubmitButton>
      </Card>
    </form>
  );
}
