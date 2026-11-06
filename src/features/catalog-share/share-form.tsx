"use client";

import { useState, useTransition } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/lib/use-action-form";
import type { FormState } from "@/lib/forms";
import { regenerateCatalogLink, saveCatalogShare } from "./actions";
import type { CatalogShareRow } from "./schema";

export function ShareForm({ share, origin }: { share: CatalogShareRow | null; origin: string }) {
  const { state, onSubmit, pending } = useActionForm(saveCatalogShare, {} as FormState);
  const [copied, setCopied] = useState(false);
  const [regen, startRegen] = useTransition();
  const [regenState, setRegenState] = useState<FormState>({});
  const link = share ? `${origin}/c/${share.token}` : null;

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // sem permissão de área de transferência: o link continua visível para copiar à mão
    }
  };

  return (
    <div className="space-y-6">
      {link && (
        <Card className="space-y-3" data-testid="link-vitrine">
          <h2 className="font-semibold">Link da sua vitrine</h2>
          <p className="text-sm text-muted">{share?.enabled ? "Envie este link aos clientes: quem tiver o link vê os produtos, sem precisar de conta." : "O link está desativado: ninguém consegue abrir até você ativar de novo."}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input readOnly value={link} aria-label="Link da vitrine" onFocus={(e) => e.currentTarget.select()} />
            <Button type="button" variant="secondary" onClick={copy}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "Copiado" : "Copiar link"}</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <a className="font-medium text-accent-strong underline" href={link} target="_blank" rel="noopener noreferrer">Ver como o cliente vê</a>
            <Button type="button" variant="ghost" size="sm" disabled={regen} onClick={() => { if (confirm("Gerar um novo link? O link atual deixa de funcionar.")) startRegen(async () => setRegenState(await regenerateCatalogLink())); }}>Gerar novo link</Button>
          </div>
          <FormMessage error={regenState.error} ok={regenState.ok} />
        </Card>
      )}

      <form onSubmit={onSubmit} className="space-y-4" data-testid="form-vitrine">
        <Card className="space-y-4">
          <h2 className="font-semibold">Opções da vitrine</h2>
          <Field label="Título da vitrine" hint="Em branco usa o nome do seu negócio." error={state.fieldErrors?.title}>
            <Input name="title" defaultValue={share?.title ?? ""} maxLength={80} />
          </Field>
          <Checkbox name="enabled" label="Link ativo (clientes conseguem abrir)" defaultChecked={share?.enabled ?? true} />
          <Checkbox name="showPrices" label="Mostrar os preços" defaultChecked={share?.show_prices ?? true} />
          <Checkbox name="showOutOfStock" label="Mostrar também os produtos sem estoque" defaultChecked={share?.show_out_of_stock ?? false} />
          <p className="rounded-xl bg-paper px-3 py-2 text-sm text-muted">A vitrine mostra só nome, foto, descrição, preço e disponibilidade. Custo, margem e lucro <strong className="text-ink">nunca</strong> aparecem. Produtos arquivados ou sem preço ficam de fora.</p>
        </Card>
        <FormMessage error={state.error} ok={state.ok} />
        <SubmitButton pending={pending}>{share ? "Salvar vitrine" : "Criar link da vitrine"}</SubmitButton>
      </form>
    </div>
  );
}
