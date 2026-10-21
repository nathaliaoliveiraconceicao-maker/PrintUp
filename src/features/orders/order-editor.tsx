"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { formatBRL, parseDecimal } from "@/lib/utils";
import { calculateQuote, type DiscountType } from "@/features/quotes/calc";
import { saveOrder } from "./actions";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABEL, type PaymentMethod } from "./status";

export interface OrderEditorProduct { id: string; name: string; description: string | null; sale_price: number | null }
export interface OrderEditorCustomer { id: string; name: string; phone: string | null }
export interface OrderEditorInitial {
  orderId: string;
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  dueDate: string;
  paymentMethod: PaymentMethod | "";
  notes: string;
  discountType: DiscountType;
  discountValue: string;
  items: { kind: "produto" | "personalizacao"; productId: string | null; name: string; description: string; quantity: number; unitPrice: number; discountPercent: number }[];
}

interface Line { key: number; kind: "produto" | "personalizacao"; productId: string | null; name: string; description: string; quantity: string; unitPrice: string; discountPercent: string }

const dec = (n: number) => String(n).replace(".", ",");
const num = (s: string) => {
  const n = parseDecimal(s);
  return Number.isNaN(n) ? (s.trim() === "" ? 0 : NaN) : n;
};

export function OrderEditor({ products, customers, initial }: { products: OrderEditorProduct[]; customers: OrderEditorCustomer[]; initial?: OrderEditorInitial }) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState<string | null>(initial?.customerId ?? null);
  const [name, setName] = useState(initial?.customerName ?? "");
  const [phone, setPhone] = useState(initial?.customerPhone ?? "");
  const [lines, setLines] = useState<Line[]>(() =>
    (initial?.items ?? []).map((i, k) => ({ key: k + 1, kind: i.kind, productId: i.productId, name: i.name, description: i.description, quantity: String(i.quantity), unitPrice: dec(i.unitPrice), discountPercent: dec(i.discountPercent) })),
  );
  const [nextKey, setNextKey] = useState(1000);
  const [discountType, setDiscountType] = useState<DiscountType>(initial?.discountType ?? "nenhum");
  const [discountValue, setDiscountValue] = useState(initial?.discountValue ?? "");
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? "");
  const [method, setMethod] = useState<PaymentMethod | "">(initial?.paymentMethod ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  const parsed = lines.map((l) => ({ quantity: Math.floor(num(l.quantity)), unitPrice: num(l.unitPrice), discountPercent: num(l.discountPercent) }));
  const invalid = parsed.some((l) => !(l.quantity >= 1) || Number.isNaN(l.unitPrice) || !(l.discountPercent >= 0 && l.discountPercent <= 100));
  const discountNum = discountType === "nenhum" ? 0 : num(discountValue);
  const totals = invalid || Number.isNaN(discountNum) ? null : calculateQuote(parsed, { type: discountType, value: discountNum });

  const patch = (key: number, p: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));
  const add = (l: Omit<Line, "key">) => { setLines((ls) => [...ls, { ...l, key: nextKey }]); setNextKey((k) => k + 1); };

  const submit = () => {
    setError(undefined);
    if (lines.length === 0) return setError("Adicione ao menos um item.");
    if (invalid || !totals) return setError("Revise quantidades, preços e descontos.");
    if (name.trim() === "") return setError("Informe o nome do cliente.");
    if (totals.discountCapped) return setError("O desconto não pode ser maior que o subtotal.");
    start(async () => {
      const res = await saveOrder({
        orderId: initial?.orderId ?? null,
        customerId,
        customer: { name, phone },
        dueDate: dueDate || null,
        paymentMethod: method || null,
        notes,
        discount: { type: discountType, value: discountNum },
        items: lines.map((l, i) => ({ kind: l.kind, productId: l.productId, name: l.name, description: l.description, quantity: parsed[i].quantity, unitPrice: parsed[i].unitPrice, discountPercent: parsed[i].discountPercent })),
      });
      if (res.ok && res.orderId) router.push(`/pedidos/${res.orderId}`);
      else setError(res.error ?? "Não foi possível salvar.");
    });
  };

  return (
    <div className="space-y-6" data-testid="editor-pedido">
      <Card className="space-y-4">
        <h2 className="font-semibold">Cliente</h2>
        {customers.length > 0 && (
          <Field label="Cliente salvo">
            <Select aria-label="Cliente salvo" value={customerId ?? ""} onChange={(e) => { const c = customers.find((x) => x.id === e.target.value); setCustomerId(c?.id ?? null); if (c) { setName(c.name); setPhone(c.phone ?? ""); } }}>
              <option value="">Novo cliente…</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome"><Input value={name} onChange={(e) => { setName(e.target.value); setCustomerId(null); }} maxLength={120} /></Field>
          <Field label="WhatsApp / telefone"><Input value={phone} inputMode="tel" onChange={(e) => setPhone(e.target.value)} maxLength={30} /></Field>
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="font-semibold">Itens</h2>
        {lines.length === 0 && <p className="text-sm text-muted">Escolha produtos do catálogo ou adicione uma personalização.</p>}
        <ul className="space-y-3">
          {lines.map((l, i) => (
            <li key={l.key} className="space-y-3 rounded-xl border border-line p-3" data-testid="item-pedido">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1 space-y-3">
                  <Field label={l.kind === "produto" ? "Produto" : "Personalização / serviço"}><Input value={l.name} onChange={(e) => patch(l.key, { name: e.target.value })} maxLength={160} /></Field>
                </div>
                <Button type="button" variant="ghost" size="icon" aria-label={`Remover ${l.name || "item"}`} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}><Trash2 size={18} /></Button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Qtd."><Input value={l.quantity} inputMode="numeric" onChange={(e) => patch(l.key, { quantity: e.target.value.replace(/\D/g, "") })} /></Field>
                <Field label="Preço unit. (R$)"><Input value={l.unitPrice} inputMode="decimal" onChange={(e) => patch(l.key, { unitPrice: e.target.value })} /></Field>
                <Field label="Desconto (%)"><Input value={l.discountPercent} inputMode="decimal" onChange={(e) => patch(l.key, { discountPercent: e.target.value })} /></Field>
              </div>
              <p className="num text-right text-sm font-medium">{totals ? formatBRL(totals.lineTotals[i]) : "—"}</p>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Select aria-label="Adicionar produto" value="" onChange={(e) => { const p = products.find((x) => x.id === e.target.value); if (p) add({ kind: "produto", productId: p.id, name: p.name, description: p.description ?? "", quantity: "1", unitPrice: p.sale_price !== null ? dec(p.sale_price) : "", discountPercent: "0" }); }} className="sm:max-w-xs">
            <option value="">+ Adicionar produto do catálogo…</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}{p.sale_price !== null ? ` — ${formatBRL(p.sale_price)}` : ""}</option>)}
          </Select>
          <Button type="button" variant="secondary" onClick={() => add({ kind: "personalizacao", productId: null, name: "", description: "", quantity: "1", unitPrice: "", discountPercent: "0" })}><Wand2 size={16} />Personalização</Button>
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="font-semibold">Desconto, entrega e pagamento</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Desconto no total">
            <Select value={discountType} onChange={(e) => setDiscountType(e.target.value as DiscountType)}>
              <option value="nenhum">Sem desconto</option>
              <option value="percentual">Percentual (%)</option>
              <option value="valor">Valor (R$)</option>
            </Select>
          </Field>
          {discountType !== "nenhum" && <Field label={discountType === "percentual" ? "Desconto (%)" : "Desconto (R$)"}><Input value={discountValue} inputMode="decimal" onChange={(e) => setDiscountValue(e.target.value)} /></Field>}
          <Field label="Prazo de entrega"><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
          <Field label="Forma de pagamento">
            <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod | "")}>
              <option value="">A definir</option>
              {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Observações"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} className="min-h-16" /></Field>
      </Card>

      <Card className="space-y-2" data-testid="totais-pedido">
        <div className="flex justify-between text-sm"><span className="text-muted">Subtotal</span><span className="num">{totals ? formatBRL(totals.subtotal) : "—"}</span></div>
        {totals && totals.discountTotal > 0 && <div className="flex justify-between text-sm"><span className="text-muted">Desconto</span><span className="num">- {formatBRL(totals.discountTotal)}</span></div>}
        <div className="flex items-baseline justify-between border-t border-line pt-2"><span className="font-semibold">Total</span><span className="num text-2xl font-semibold text-accent-strong">{totals ? formatBRL(totals.total) : "—"}</span></div>
      </Card>

      <FormMessage error={error} />
      <div className="flex gap-3">
        <Button onClick={submit} disabled={pending}><Plus size={16} />{pending ? "Salvando…" : initial ? "Salvar alterações" : "Criar pedido"}</Button>
        <Button type="button" variant="secondary" onClick={() => router.back()} disabled={pending}>Cancelar</Button>
      </div>
    </div>
  );
}
