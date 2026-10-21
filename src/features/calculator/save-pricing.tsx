"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import type { PricingInput } from "@/lib/pricing";
import { savePricing } from "@/features/products/actions";
import type { SavePricingState } from "@/features/products/schema";

const NEW = "__new__";

export function SavePricing({
  products,
  input,
  printerId,
  filamentId,
  profileId,
  defaultName,
}: {
  products: { id: string; name: string }[];
  input: PricingInput | null;
  printerId?: string;
  filamentId?: string;
  /** Perfil importado que originou os dados (para registrar a origem no histórico do preço). */
  profileId?: string;
  /** Nome sugerido para um produto novo (ex.: título do modelo importado). */
  defaultName?: string;
}) {
  // Com um modelo importado, o padrão é criar um produto novo com o nome do modelo.
  const [choice, setChoice] = useState(defaultName ? NEW : products.length ? products[0].id : NEW);
  const [name, setName] = useState(defaultName ?? "");
  const [state, setState] = useState<SavePricingState>({});
  const [pending, start] = useTransition();
  const creating = choice === NEW;

  const save = () =>
    start(async () => {
      if (!input) return;
      const res = await savePricing({
        ...(creating ? { newProductName: name } : { productId: choice }),
        printerId: printerId || null,
        filamentId: filamentId || null,
        profileId: profileId || null,
        input,
      });
      setState(res);
      if (res.ok) {
        setName(defaultName ?? "");
        if (res.productId) setChoice(res.productId);
      }
    });

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="font-semibold">Salvar este preço</h2>
        <p className="mt-1 text-sm text-muted">
          Guarda um retrato do cálculo no produto. Mudar seus custos depois não altera o histórico.
        </p>
      </div>
      <Field label="Produto">
        <Select value={choice} onChange={(e) => { setChoice(e.target.value); setState({}); }}>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          <option value={NEW}>+ Novo produto…</option>
        </Select>
      </Field>
      {creating && (
        <Field label="Nome do novo produto">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Suporte de celular" maxLength={120} />
        </Field>
      )}
      <FormMessage error={state.error} />
      {state.ok && (
        <p role="status" className="flex items-center gap-2 rounded-xl bg-ok/10 px-3 py-2 text-sm text-ok">
          <Check size={16} /> Precificação salva.
          {state.productId && <Link href={`/produtos/${state.productId}`} className="ml-1 font-medium underline">Ver produto</Link>}
        </p>
      )}
      <Button onClick={save} disabled={pending || !input || (creating && name.trim() === "")}>
        {pending ? "Salvando…" : "Salvar precificação"}
      </Button>
      {!input && <p className="text-xs text-muted">Corrija os dados da calculadora para poder salvar.</p>}
    </Card>
  );
}
