"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Factory } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { uuid4 } from "@/features/imports/paths";
import { parseDecimal } from "@/lib/utils";
import { registerProduction } from "./actions";
import type { StockActionState } from "./schema";

type ProductOption = { id: string; name: string; weight_g: number | null; filament_id: string | null };
type FilamentOption = { id: string; name: string; available: number };

const num = (s: string) => {
  const n = parseDecimal(s);
  return Number.isNaN(n) ? (s.trim() === "" ? 0 : NaN) : n;
};
const g = (n: number) => `${(Math.round(n * 10) / 10).toLocaleString("pt-BR")} g`;

/** Registra uma produção: soma as peças ao estoque do produto e baixa o filamento usado das bobinas. */
export function ProductionForm({ products, filaments }: { products: ProductOption[]; filaments: FilamentOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [filamentId, setFilamentId] = useState(() => products[0]?.filament_id && filaments.some((f) => f.id === products[0].filament_id) ? products[0].filament_id : (filaments[0]?.id ?? ""));
  const [qty, setQty] = useState("1");
  const [grams, setGrams] = useState("");
  const [gramsTouched, setGramsTouched] = useState(false);
  const [key, setKey] = useState(() => uuid4());
  const [state, setState] = useState<StockActionState>({});
  const [pending, start] = useTransition();

  const product = products.find((p) => p.id === productId);
  const filament = filaments.find((f) => f.id === filamentId);
  const q = num(qty);
  // Sugestão (peso do produto × peças); o usuário informa o gasto real e isso passa a valer.
  const suggested = product?.weight_g && q > 0 ? Math.round(product.weight_g * q * 10) / 10 : null;
  const shownGrams = gramsTouched ? grams : suggested != null ? String(suggested).replace(".", ",") : grams;
  const g_ = num(shownGrams);
  const ok = Number.isInteger(q) && q >= 1 && g_ > 0 && !!product && !!filament;
  const short = ok && filament && g_ > filament.available + 0.004;

  const pick = (id: string) => {
    setProductId(id);
    const p = products.find((x) => x.id === id);
    if (p?.filament_id && filaments.some((f) => f.id === p.filament_id)) setFilamentId(p.filament_id);
    setGramsTouched(false);
  };
  const submit = () =>
    start(async () => {
      const r = await registerProduction({ productId, filamentId, quantity: q, grams: g_, key });
      setState(r);
      if (r.ok) { setKey(uuid4()); setGrams(""); setGramsTouched(false); setQty("1"); router.refresh(); }
    });

  if (products.length === 0 || filaments.length === 0) {
    return <Card className="text-sm text-muted">Para registrar produção, cadastre ao menos um produto e um filamento.</Card>;
  }
  return (
    <div className="space-y-3">
      {!open ? (
        <Button onClick={() => { setOpen(true); setState({}); }} data-testid="registrar-producao"><Factory size={18} />Registrar produção</Button>
      ) : (
        <Card className="space-y-4" data-testid="form-producao">
          <div>
            <h2 className="font-semibold">Registrar produção</h2>
            <p className="mt-1 text-sm text-muted">Soma as peças prontas ao estoque do produto e <strong>baixa o filamento usado</strong> da bobina automaticamente.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Produto"><Select value={productId} onChange={(e) => pick(e.target.value)}>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
            <Field label="Peças produzidas"><Input inputMode="numeric" value={qty} onChange={(e) => { setQty(e.target.value); setGramsTouched(false); }} /></Field>
            <Field label="Filamento usado"><Select value={filamentId} onChange={(e) => setFilamentId(e.target.value)}>{filaments.map((f) => <option key={f.id} value={f.id}>{f.name} — {g(f.available)} disponíveis</option>)}</Select></Field>
            <Field label="Gramas gastos (total)" hint={suggested != null && !gramsTouched ? "Sugerido pelo peso do produto: ajuste para o gasto real." : "Peso total de filamento usado nessas peças."}>
              <Input inputMode="decimal" value={shownGrams} onChange={(e) => { setGrams(e.target.value); setGramsTouched(true); }} />
            </Field>
          </div>
          {ok && filament && (
            <p className={short ? "rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger" : "rounded-xl bg-paper px-3 py-2 text-sm"} data-testid="previa-producao" role={short ? "alert" : undefined}>
              {short
                ? `Estoque insuficiente: faltam ${g(g_ - filament.available)} de ${filament.name}. Cadastre outra bobina antes.`
                : <>Vai somar <strong>{q} peça{q > 1 ? "s" : ""}</strong> ao estoque de {product?.name} e baixar <strong>{g(g_)}</strong> de {filament.name} (restam {g(filament.available - g_)}).</>}
            </p>
          )}
          {state.error && <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{state.error}</p>}
          <div className="flex gap-2">
            <Button disabled={pending || !ok || !!short} onClick={submit}>{pending ? "Registrando…" : "Registrar e baixar estoque"}</Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>Fechar</Button>
          </div>
        </Card>
      )}
      {state.ok && state.message && <p role="status" className="text-sm text-ok" data-testid="producao-ok">{state.message}</p>}
    </div>
  );
}
