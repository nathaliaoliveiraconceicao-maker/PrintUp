"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/lib/use-action-form";
import { deleteChannel, saveChannel, type ChannelState } from "./actions";
import type { ChannelRow } from "./schema";

const v = (n: number) => (n ? String(n).replace(".", ",") : "");

function ChannelForm({ channel, preset }: { channel?: ChannelRow; preset?: string }) {
  const router = useRouter();
  const [name, setName] = useState(channel?.name ?? preset ?? "");
  const [removing, startRemove] = useTransition();
  const [removeError, setRemoveError] = useState<string>();
  const { state, onSubmit, pending } = useActionForm(async (prev: ChannelState, fd: FormData) => {
    const r = await saveChannel(channel?.id ?? null, prev, fd);
    if (r.ok) router.refresh();
    return r;
  }, {} as ChannelState);
  const e = state.fieldErrors ?? {};
  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-xl border border-line p-3" data-testid={channel ? "canal" : "novo-canal"}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Canal" error={e.name}><Input name="name" value={name} onChange={(ev) => setName(ev.target.value)} maxLength={40} placeholder="Ex.: Shopee" /></Field>
        <Field label="Taxa (%)" error={e.feePercent}><Input name="feePercent" inputMode="decimal" defaultValue={v(channel?.fee_percent ?? 0)} /></Field>
        <Field label="Taxa fixa por venda (R$)" error={e.feeFixed}><Input name="feeFixed" inputMode="decimal" defaultValue={v(channel?.fee_fixed ?? 0)} /></Field>
      </div>
      <FormMessage error={state.error ?? removeError} ok={state.ok} />
      <div className="flex flex-wrap gap-2">
        <SubmitButton pending={pending} size="sm">{channel ? "Salvar canal" : "Adicionar canal"}</SubmitButton>
        {channel && (
          <Button type="button" variant="ghost" size="sm" disabled={removing} onClick={() => { if (confirm(`Remover o canal "${channel.name}"?`)) startRemove(async () => { const r = await deleteChannel(channel.id); if (r.error) setRemoveError(r.error); else router.refresh(); }); }}>
            Remover
          </Button>
        )}
      </div>
    </form>
  );
}

/** Canais de venda (Shopee, Mercado Livre, outros): cada um com a sua taxa. A calculadora mostra o preço de cada canal. */
export function ChannelsEditor({ channels }: { channels: ChannelRow[] }) {
  const [preset, setPreset] = useState<string | undefined>();
  const [formKey, setFormKey] = useState(0);
  const has = (n: string) => channels.some((c) => c.name.trim().toLowerCase() === n.toLowerCase());
  return (
    <Card className="space-y-4" data-testid="canais-de-venda">
      <div>
        <h2 className="font-semibold">04 · Canais de venda</h2>
        <p className="mt-1 text-sm text-muted">Shopee, Mercado Livre ou qualquer outro lugar onde você vende. Informe a taxa do <strong>seu</strong> tipo de anúncio: as taxas reais variam por categoria, preço e campanha. Em cada cálculo, o PrintUp mostra o preço de cada canal mantendo a sua margem depois das taxas.</p>
      </div>
      {channels.length === 0 && <p className="text-sm text-muted">Nenhum canal ainda. Adicione o primeiro abaixo.</p>}
      <div className="space-y-3">{channels.map((c) => <ChannelForm key={`${c.id}-${c.fee_percent}-${c.fee_fixed}`} channel={c} />)}</div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Adicionar canal</p>
        <div className="flex flex-wrap gap-2">
          {["Shopee", "Mercado Livre", "Outro"].filter((n) => n === "Outro" || !has(n)).map((n) => (
            <Button key={n} type="button" variant="secondary" size="sm" onClick={() => { setPreset(n === "Outro" ? "" : n); setFormKey((k) => k + 1); }}>{n}</Button>
          ))}
        </div>
        <ChannelForm key={`novo-${formKey}-${channels.length}`} preset={preset} />
      </div>
    </Card>
  );
}
