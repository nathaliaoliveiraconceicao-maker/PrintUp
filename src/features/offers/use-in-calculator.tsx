"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import Link from "next/link";
import { Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { formatBRL } from "@/lib/utils";
import { applyOfferPrice, type ApplyState } from "./actions";

type Fil = { id: string; name: string; price_per_kg: number };

/** "Usar este preço na minha calculadora": mostra o antes e o depois e só substitui um valor existente depois da confirmação. */
export function UseInCalculator({ offerId, title, perKgCents, loggedIn, filaments }: { offerId: string; title: string; perKgCents: number; loggedIn: boolean; filaments: Fil[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(filaments[0]?.id ?? "novo");
  const [name, setName] = useState(title.slice(0, 80));
  const [state, setState] = useState<ApplyState>({});
  const [pending, start] = useTransition();
  const next = perKgCents / 100;
  const cur = filaments.find((f) => f.id === target);

  if (!loggedIn) {
    return (
      <p className="rounded-xl bg-paper px-3 py-3 text-sm" data-testid="usar-calculadora-login">
        <Calculator size={16} className="mr-1.5 inline text-accent-strong" aria-hidden="true" />
        <Link href="/login" className="font-medium text-accent-strong underline">Entre</Link> ou <Link href="/cadastro" className="font-medium text-accent-strong underline">crie sua conta grátis</Link> para usar este preço na sua calculadora.
      </p>
    );
  }
  const run = (confirm: boolean) => start(async () => { const r = await applyOfferPrice({ offerId, target, name: target === "novo" ? name : undefined, confirm }); setState(r); if (r.ok) router.refresh(); });
  return (
    <div className="space-y-3" data-testid="usar-calculadora">
      {!open ? (
        <Button onClick={() => { setOpen(true); setState({}); }} data-testid="abrir-usar-calculadora"><Calculator size={16} />Usar este preço na minha calculadora</Button>
      ) : (
        <div className="space-y-3 rounded-2xl border border-line bg-surface p-4">
          <p className="text-sm">Preço da oferta: <strong className="num">{formatBRL(next)}</strong> por kg.</p>
          <Field label="Em qual filamento?">
            <Select value={target} onChange={(e) => { setTarget(e.target.value); setState({}); }}>
              {filaments.map((f) => <option key={f.id} value={f.id}>{f.name} (hoje {formatBRL(Number(f.price_per_kg))}/kg)</option>)}
              <option value="novo">Cadastrar como um novo filamento</option>
            </Select>
          </Field>
          {target === "novo" && <Field label="Nome do novo filamento"><Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></Field>}
          {cur && Number(cur.price_per_kg) !== next && <p className="text-sm text-muted">Vai trocar <span className="num">{formatBRL(Number(cur.price_per_kg))}</span> por <span className="num">{formatBRL(next)}</span> por kg. Seus cálculos e produtos já salvos <strong className="text-ink">não mudam</strong>.</p>}
          {state.needsConfirm && (
            <div role="alert" className="space-y-2 rounded-xl bg-accent-soft px-3 py-3 text-sm text-warn" data-testid="confirmar-troca">
              <p>Confirma a troca de <strong className="num">{formatBRL(state.needsConfirm.current)}</strong> por <strong className="num">{formatBRL(state.needsConfirm.next)}</strong> por kg?{state.needsConfirm.savingPer100g > 0 ? ` Cada 100 g de peça fica ${formatBRL(state.needsConfirm.savingPer100g)} mais barato.` : state.needsConfirm.savingPer100g < 0 ? ` Atenção: este preço é MAIOR que o atual (+${formatBRL(-state.needsConfirm.savingPer100g)} a cada 100 g).` : ""}</p>
              <Button size="sm" disabled={pending} onClick={() => run(true)} data-testid="confirmar-substituir">Sim, substituir</Button>
            </div>
          )}
          {state.error && <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{state.error}</p>}
          {state.ok && state.message && <p role="status" className="rounded-xl bg-ok/10 px-3 py-2 text-sm text-ok" data-testid="calculadora-ok">{state.message} <Link href="/calculadora" className="font-medium underline">Abrir a calculadora</Link></p>}
          <div className="flex gap-2">
            {!state.needsConfirm && !state.ok && <Button disabled={pending} onClick={() => run(false)} data-testid="aplicar-preco">{pending ? "Aplicando…" : "Aplicar"}</Button>}
            <Button variant="ghost" onClick={() => setOpen(false)}>Fechar</Button>
          </div>
        </div>
      )}
    </div>
  );
}
