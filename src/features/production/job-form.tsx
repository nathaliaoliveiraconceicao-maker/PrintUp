"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { parseDecimal } from "@/lib/utils";
import { createJob } from "./actions";
import type { JobActionState } from "./schema";

const num = (s: string) => {
  const n = parseDecimal(s);
  return Number.isNaN(n) ? (s.trim() === "" ? null : NaN) : n;
};

/** Cria um lote (parte da quantidade) de um item, escolhendo impressora e filamento. Divide o pedido em quantos lotes quiser. */
export function JobForm({
  itemId,
  itemName,
  remaining,
  weightG,
  defaultFilamentId,
  defaultPrinterId,
  printers,
  filaments,
}: {
  itemId: string;
  itemName: string;
  remaining: number;
  weightG: number | null;
  defaultFilamentId: string | null;
  defaultPrinterId: string | null;
  printers: { id: string; name: string }[];
  filaments: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState(String(remaining));
  const [printerId, setPrinterId] = useState(defaultPrinterId ?? "");
  const [filamentId, setFilamentId] = useState(defaultFilamentId ?? "");
  const [grams, setGrams] = useState("");
  const [waste, setWaste] = useState("0");
  const [state, setState] = useState<JobActionState>({});
  const [pending, start] = useTransition();
  const shortage = state.error?.startsWith("Estoque insuficiente");

  const q = Math.floor(num(qty) ?? 0);
  const suggested = weightG !== null && q > 0 ? Math.round(weightG * q * (1 + (num(waste) || 0) / 100) * 10) / 10 : null;

  const submit = (mode: "reservar" | "sem_reserva") =>
    start(async () => {
      const r = await createJob({ itemId, quantity: q, printerId: printerId || null, filamentId: filamentId || null, estGrams: num(grams), wastePercent: num(waste) ?? 0, mode });
      setState(r);
      if (r.ok) {
        setOpen(false);
        setQty("1");
        router.refresh();
      }
    });

  if (remaining <= 0) return null;
  return (
    <div className="space-y-3">
      {!open ? (
        <Button size="sm" variant="secondary" onClick={() => { setOpen(true); setQty(String(remaining)); setState({}); }} data-testid="criar-lote">
          Criar lote de produção ({remaining} restante{remaining > 1 ? "s" : ""})
        </Button>
      ) : (
        <div className="space-y-3 rounded-xl border border-line bg-paper p-3" data-testid="form-lote">
          <p className="text-sm font-medium">Novo lote de “{itemName}”</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={`Quantidade do lote (até ${remaining})`}><Input inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} /></Field>
            <Field label="Impressora">
              <Select value={printerId} onChange={(e) => setPrinterId(e.target.value)}>
                <option value="">Definir depois</option>
                {printers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
            <Field label="Filamento">
              <Select value={filamentId} onChange={(e) => setFilamentId(e.target.value)}>
                <option value="">Sem filamento (não reserva)</option>
                {filaments.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </Select>
            </Field>
            <Field label="Margem para purga/desperdício (%)"><Input inputMode="decimal" value={waste} onChange={(e) => setWaste(e.target.value)} /></Field>
            <Field label="Material a reservar (g)" hint={weightG === null ? "O produto não tem peso cadastrado: informe as gramas para reservar." : suggested !== null ? `Em branco = ${String(suggested).replace(".", ",")} g (peso do produto × quantidade${(num(waste) || 0) > 0 ? " + margem" : ""}).` : undefined}>
              <Input inputMode="decimal" value={grams} onChange={(e) => setGrams(e.target.value)} placeholder={suggested !== null ? String(suggested).replace(".", ",") : "0"} />
            </Field>
          </div>
          {state.error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{state.error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={pending || !(q >= 1)} onClick={() => submit("reservar")}>{pending ? "Criando…" : "Criar e reservar material"}</Button>
            {shortage && <Button size="sm" variant="secondary" disabled={pending} onClick={() => submit("sem_reserva")}>Criar mesmo assim, sem reservar</Button>}
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Fechar</Button>
          </div>
        </div>
      )}
      {state.ok && state.message && <p role="status" className="text-sm text-ok">{state.message}</p>}
    </div>
  );
}
