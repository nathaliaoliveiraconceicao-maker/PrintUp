"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { uuid4 } from "@/features/imports/paths";
import { MATERIALS } from "@/features/filaments/schema";
import { parseDecimal } from "@/lib/utils";
import { adjustSpool, createSpool, setMinStock, updateSpoolMeta } from "./actions";
import type { SpoolRow, StockActionState } from "./schema";
import { SPOOL_STATUS_LABEL } from "./schema";

const num = (s: string) => {
  const n = parseDecimal(s);
  return Number.isNaN(n) ? (s.trim() === "" ? 0 : NaN) : n;
};

export function SpoolForm({ filaments }: { filaments: { id: string; name: string; material: string; color: string | null }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [filamentId, setFilamentId] = useState(filaments[0]?.id ?? "");
  const [maker, setMaker] = useState("");
  const [material, setMaterial] = useState("PLA");
  const [color, setColor] = useState("");
  const [initial, setInitial] = useState("1000");
  const [price, setPrice] = useState("");
  const [date, setDate] = useState("");
  const [location, setLocation] = useState("");
  const [key, setKey] = useState(() => uuid4());
  const [state, setState] = useState<StockActionState>({});
  const [pending, start] = useTransition();

  const submit = () =>
    start(async () => {
      const r = await createSpool({ filamentId: filamentId || null, manufacturer: maker, material: filamentId ? undefined : material, color: filamentId ? color || undefined : color, initialG: num(initial), pricePaid: num(price), purchasedAt: date || null, location, key });
      setState(r);
      if (r.ok) { setOpen(false); setKey(uuid4()); setPrice(""); router.refresh(); }
    });

  return (
    <div className="space-y-3">
      {!open ? (
        <Button onClick={() => { setOpen(true); setState({}); }} data-testid="nova-bobina"><Plus size={18} />Nova bobina</Button>
      ) : (
        <Card className="space-y-4" data-testid="form-bobina">
          <h2 className="font-semibold">Cadastrar bobina</h2>
          <p className="text-xs text-muted">Pode cadastrar várias bobinas do mesmo material e cor: o estoque soma todas.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Filamento cadastrado">
              <Select value={filamentId} onChange={(e) => setFilamentId(e.target.value)}>
                {filaments.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                <option value="">Outro (informar material)</option>
              </Select>
            </Field>
            {!filamentId && <Field label="Tipo de material"><Select value={material} onChange={(e) => setMaterial(e.target.value)}>{MATERIALS.map((m) => <option key={m}>{m}</option>)}</Select></Field>}
            <Field label="Fabricante"><Input value={maker} onChange={(e) => setMaker(e.target.value)} maxLength={80} /></Field>
            <Field label="Cor" hint={filamentId ? "Em branco usa a cor do filamento." : undefined}><Input value={color} onChange={(e) => setColor(e.target.value)} maxLength={40} /></Field>
            <Field label="Peso inicial (g)"><Input inputMode="decimal" value={initial} onChange={(e) => setInitial(e.target.value)} /></Field>
            <Field label="Valor pago (R$)"><Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
            <Field label="Data da compra"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="Local de armazenamento"><Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ex.: Prateleira 2" maxLength={80} /></Field>
          </div>
          {state.error && <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{state.error}</p>}
          <div className="flex gap-2">
            <Button disabled={pending} onClick={submit}>{pending ? "Salvando…" : "Cadastrar bobina"}</Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>Fechar</Button>
          </div>
        </Card>
      )}
      {state.ok && state.message && <p role="status" className="text-sm text-ok">{state.message}</p>}
    </div>
  );
}

export function MinStockEditor({ filamentId, value }: { filamentId: string; value: number }) {
  const router = useRouter();
  const [v, setV] = useState(String(value));
  const [msg, setMsg] = useState<StockActionState>({});
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <label htmlFor={`min-${filamentId}`} className="text-muted">Avisar abaixo de (g)</label>
      <input id={`min-${filamentId}`} inputMode="numeric" value={v} onChange={(e) => setV(e.target.value.replace(/\D/g, ""))} className="h-11 w-24 rounded-xl border border-line bg-surface px-3 text-base sm:text-sm" />
      <Button size="sm" variant="secondary" disabled={pending || v === "" || Number(v) === value} onClick={() => start(async () => { const r = await setMinStock(filamentId, Number(v)); setMsg(r); if (r.ok) router.refresh(); })}>Salvar</Button>
      {msg.error && <span role="alert" className="text-danger">{msg.error}</span>}
    </div>
  );
}

export function SpoolMetaForm({ spool }: { spool: SpoolRow }) {
  const router = useRouter();
  const [maker, setMaker] = useState(spool.manufacturer ?? "");
  const [color, setColor] = useState(spool.color ?? "");
  const [location, setLocation] = useState(spool.location ?? "");
  const [status, setStatus] = useState<SpoolRow["status"]>(spool.status);
  const [notes, setNotes] = useState(spool.notes ?? "");
  const [msg, setMsg] = useState<StockActionState>({});
  const [pending, start] = useTransition();
  return (
    <div className="space-y-4" data-testid="meta-bobina">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Fabricante"><Input value={maker} onChange={(e) => setMaker(e.target.value)} maxLength={80} /></Field>
        <Field label="Cor"><Input value={color} onChange={(e) => setColor(e.target.value)} maxLength={40} /></Field>
        <Field label="Local de armazenamento"><Input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={80} /></Field>
        <Field label="Status da bobina">
          <Select value={status} onChange={(e) => setStatus(e.target.value as SpoolRow["status"])}>
            {(Object.keys(SPOOL_STATUS_LABEL) as SpoolRow["status"][]).map((s) => <option key={s} value={s}>{SPOOL_STATUS_LABEL[s]}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Observações"><Input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} /></Field>
      {msg.error && <p role="alert" className="text-sm text-danger">{msg.error}</p>}
      {msg.ok && <p role="status" className="text-sm text-ok">Salvo.</p>}
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => start(async () => { const r = await updateSpoolMeta({ spoolId: spool.id, manufacturer: maker, color, location, status, notes }); setMsg(r); if (r.ok) router.refresh(); })}>{pending ? "Salvando…" : "Salvar dados da bobina"}</Button>
    </div>
  );
}

export function AdjustForm({ spoolId, remaining }: { spoolId: string; remaining: number }) {
  const router = useRouter();
  const [value, setValue] = useState(String(remaining).replace(".", ","));
  const [note, setNote] = useState("");
  const [key, setKey] = useState(() => uuid4());
  const [msg, setMsg] = useState<StockActionState>({});
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3" data-testid="ajuste-bobina">
      <p className="text-xs text-muted">Use depois de pesar a bobina ou corrigir um erro. O ajuste fica registrado no histórico, com o motivo.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Saldo correto (g)"><Input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} /></Field>
        <Field label="Motivo"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: contagem física" maxLength={300} /></Field>
      </div>
      {msg.error && <p role="alert" className="text-sm text-danger">{msg.error}</p>}
      {msg.ok && msg.message && <p role="status" className="text-sm text-ok">{msg.message}</p>}
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => start(async () => { const r = await adjustSpool({ spoolId, newRemaining: num(value), note, key }); setMsg(r); if (r.ok) { setKey(uuid4()); setNote(""); router.refresh(); } })}>{pending ? "Salvando…" : "Ajustar saldo"}</Button>
    </div>
  );
}
