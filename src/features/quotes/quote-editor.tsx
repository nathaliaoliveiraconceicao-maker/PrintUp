"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { formatBRL, parseDecimal } from "@/lib/utils";
import { saveQuote } from "./actions";
import { calculateQuote, type DiscountType } from "./calc";
import { addDays, todayBR } from "./status";

export interface EditorProduct {
  id: string;
  name: string;
  description: string | null;
  sale_price: number | null;
  stock_qty: number;
}
export interface EditorCustomer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  document: string | null;
}
export interface EditorDefaults {
  validityDays: number;
  paymentTerms: string;
  notes: string;
}
export interface EditorInitial {
  quoteId: string;
  issueDate: string;
  customerId: string | null;
  customer: { name: string; phone: string; email: string; document: string };
  validUntil: string;
  productionDays: string;
  paymentTerms: string;
  notes: string;
  discountType: DiscountType;
  discountValue: string;
  items: { kind: "produto" | "personalizacao"; productId: string | null; name: string; description: string; quantity: number; unitPrice: number; discountPercent: number }[];
}

interface Line {
  key: number;
  kind: "produto" | "personalizacao";
  productId: string | null;
  name: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discountPercent: string;
}

const dec = (n: number) => String(n).replace(".", ",");
const num = (s: string) => {
  const n = parseDecimal(s);
  return Number.isNaN(n) ? (s.trim() === "" ? 0 : NaN) : n;
};

export function QuoteEditor({
  products,
  customers,
  defaults,
  initial,
  preselect,
}: {
  products: EditorProduct[];
  customers: EditorCustomer[];
  defaults: EditorDefaults;
  initial?: EditorInitial;
  preselect?: string;
}) {
  const router = useRouter();
  const today = initial?.issueDate ?? todayBR();
  let seq = 0;
  const productLine = (p: EditorProduct): Line => ({
    key: ++seq, kind: "produto", productId: p.id, name: p.name, description: p.description ?? "",
    quantity: "1", unitPrice: p.sale_price !== null ? dec(p.sale_price) : "", discountPercent: "0",
  });

  const [customerId, setCustomerId] = useState<string | null>(initial?.customerId ?? null);
  const [cust, setCust] = useState(initial?.customer ?? { name: "", phone: "", email: "", document: "" });
  const [saveCustomer, setSaveCustomer] = useState(false);
  const [lines, setLines] = useState<Line[]>(() => {
    if (initial) {
      return initial.items.map((i) => ({
        key: ++seq, kind: i.kind, productId: i.productId, name: i.name, description: i.description,
        quantity: String(i.quantity), unitPrice: dec(i.unitPrice), discountPercent: dec(i.discountPercent),
      }));
    }
    const p = products.find((x) => x.id === preselect);
    return p ? [productLine(p)] : [];
  });
  const [nextKey, setNextKey] = useState(1000);
  const [discountType, setDiscountType] = useState<DiscountType>(initial?.discountType ?? "nenhum");
  const [discountValue, setDiscountValue] = useState(initial?.discountValue ?? "");
  const [validUntil, setValidUntil] = useState(initial?.validUntil ?? addDays(today, defaults.validityDays));
  const [productionDays, setProductionDays] = useState(initial?.productionDays ?? "");
  const [paymentTerms, setPaymentTerms] = useState(initial?.paymentTerms ?? defaults.paymentTerms);
  const [notes, setNotes] = useState(initial?.notes ?? defaults.notes);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  const parsedLines = lines.map((l) => ({ quantity: Math.floor(num(l.quantity)), unitPrice: num(l.unitPrice), discountPercent: num(l.discountPercent) }));
  const invalid = parsedLines.some((l) => !(l.quantity >= 1) || Number.isNaN(l.unitPrice) || !(l.discountPercent >= 0 && l.discountPercent <= 100));
  const discountNum = discountType === "nenhum" ? 0 : num(discountValue);
  const totals = invalid || Number.isNaN(discountNum) ? null : calculateQuote(parsedLines, { type: discountType, value: discountNum });

  const patch = (key: number, p: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));
  const addProduct = (id: string) => {
    const p = products.find((x) => x.id === id);
    if (!p) return;
    setLines((ls) => [...ls, { ...productLine(p), key: nextKey }]);
    setNextKey((k) => k + 1);
  };
  const addCustom = () => {
    setLines((ls) => [...ls, { key: nextKey, kind: "personalizacao", productId: null, name: "", description: "", quantity: "1", unitPrice: "", discountPercent: "0" }]);
    setNextKey((k) => k + 1);
  };
  const pickCustomer = (id: string) => {
    const c = customers.find((x) => x.id === id);
    setCustomerId(c?.id ?? null);
    if (c) setCust({ name: c.name, phone: c.phone ?? "", email: c.email ?? "", document: c.document ?? "" });
  };

  const submit = () => {
    setError(undefined);
    if (lines.length === 0) return setError("Adicione ao menos um item.");
    if (invalid || !totals) return setError("Revise quantidades, preços e descontos.");
    if (cust.name.trim() === "") return setError("Informe o nome do cliente.");
    if (totals.discountCapped) return setError("O desconto não pode ser maior que o subtotal.");
    start(async () => {
      const res = await saveQuote({
        quoteId: initial?.quoteId ?? null,
        customerId,
        saveCustomer: !customerId && saveCustomer,
        customer: { name: cust.name, phone: cust.phone, email: cust.email, document: cust.document },
        validUntil,
        productionDays: productionDays.trim() === "" ? null : Math.floor(num(productionDays)),
        paymentTerms,
        notes,
        discount: { type: discountType, value: discountNum },
        items: lines.map((l, i) => ({
          kind: l.kind, productId: l.productId, name: l.name, description: l.description,
          quantity: parsedLines[i].quantity, unitPrice: parsedLines[i].unitPrice, discountPercent: parsedLines[i].discountPercent,
        })),
      });
      if (res.ok && res.quoteId) router.push(`/orcamentos/${res.quoteId}`);
      else setError(res.error ?? "Não foi possível salvar.");
    });
  };

  return (
    <div className="space-y-6" data-testid="editor-orcamento">
      <Card className="space-y-4">
        <h2 className="font-semibold">Cliente</h2>
        {customers.length > 0 && (
          <Field label="Cliente salvo">
            <Select value={customerId ?? ""} onChange={(e) => pickCustomer(e.target.value)} aria-label="Cliente salvo">
              <option value="">Novo cliente…</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome"><Input value={cust.name} onChange={(e) => { setCust({ ...cust, name: e.target.value }); setCustomerId(null); }} maxLength={120} /></Field>
          <Field label="WhatsApp / telefone"><Input value={cust.phone} inputMode="tel" onChange={(e) => setCust({ ...cust, phone: e.target.value })} placeholder="(11) 99999-0000" maxLength={30} /></Field>
          <Field label="E-mail (opcional)"><Input value={cust.email} type="email" onChange={(e) => setCust({ ...cust, email: e.target.value })} maxLength={160} /></Field>
          <Field label="CPF/CNPJ (opcional)"><Input value={cust.document} onChange={(e) => setCust({ ...cust, document: e.target.value })} maxLength={30} /></Field>
        </div>
        {!customerId && <Checkbox label="Guardar este cliente para os próximos orçamentos" checked={saveCustomer} onChange={(e) => setSaveCustomer(e.target.checked)} />}
      </Card>

      <Card className="space-y-4">
        <h2 className="font-semibold">Itens</h2>
        {lines.length === 0 && <p className="text-sm text-muted">Escolha produtos do seu catálogo ou adicione uma personalização.</p>}
        <ul className="space-y-3">
          {lines.map((l, i) => {
            const lt = totals?.lineTotals[i];
            const stock = l.productId ? products.find((p) => p.id === l.productId)?.stock_qty : undefined;
            return (
              <li key={l.key} className="space-y-3 rounded-xl border border-line p-3" data-testid="item-orcamento">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1 space-y-3">
                    <Field label={l.kind === "produto" ? "Produto" : "Personalização / serviço"}>
                      <Input value={l.name} onChange={(e) => patch(l.key, { name: e.target.value })} maxLength={160} placeholder={l.kind === "personalizacao" ? "Ex.: Nome gravado" : ""} />
                    </Field>
                    <Field label="Descrição (aparece no PDF)">
                      <Input value={l.description} onChange={(e) => patch(l.key, { description: e.target.value })} maxLength={1000} />
                    </Field>
                  </div>
                  <Button type="button" variant="ghost" size="icon" aria-label={`Remover ${l.name || "item"}`} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                    <Trash2 size={18} />
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Qtd."><Input value={l.quantity} inputMode="numeric" onChange={(e) => patch(l.key, { quantity: e.target.value.replace(/\D/g, "") })} /></Field>
                  <Field label="Preço unit. (R$)"><Input value={l.unitPrice} inputMode="decimal" onChange={(e) => patch(l.key, { unitPrice: e.target.value })} /></Field>
                  <Field label="Desconto (%)"><Input value={l.discountPercent} inputMode="decimal" onChange={(e) => patch(l.key, { discountPercent: e.target.value })} /></Field>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="text-muted">
                    {stock !== undefined && Math.floor(num(l.quantity)) > stock ? `Estoque: ${stock} (será produzido sob encomenda)` : stock !== undefined ? `Estoque: ${stock}` : ""}
                  </span>
                  <span className="num font-medium">{lt !== undefined ? formatBRL(lt) : "—"}</span>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Select aria-label="Adicionar produto" value="" onChange={(e) => addProduct(e.target.value)} className="sm:max-w-xs">
            <option value="">+ Adicionar produto do catálogo…</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}{p.sale_price !== null ? ` — ${formatBRL(p.sale_price)}` : ""}</option>)}
          </Select>
          <Button type="button" variant="secondary" onClick={addCustom}><Wand2 size={16} />Personalização</Button>
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="font-semibold">Desconto e prazos</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Desconto no total">
            <Select value={discountType} onChange={(e) => setDiscountType(e.target.value as DiscountType)}>
              <option value="nenhum">Sem desconto</option>
              <option value="percentual">Percentual (%)</option>
              <option value="valor">Valor (R$)</option>
            </Select>
          </Field>
          {discountType !== "nenhum" && (
            <Field label={discountType === "percentual" ? "Desconto (%)" : "Desconto (R$)"}>
              <Input value={discountValue} inputMode="decimal" onChange={(e) => setDiscountValue(e.target.value)} />
            </Field>
          )}
          <Field label="Prazo de produção (dias)"><Input value={productionDays} inputMode="numeric" onChange={(e) => setProductionDays(e.target.value.replace(/\D/g, ""))} placeholder="Ex.: 5" /></Field>
          <Field label="Orçamento válido até"><Input type="date" value={validUntil} min={today} onChange={(e) => setValidUntil(e.target.value)} /></Field>
        </div>
        <Field label="Condições de pagamento"><Textarea value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} maxLength={1000} className="min-h-16" /></Field>
        <Field label="Observações (aparecem no PDF)"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} className="min-h-16" /></Field>
      </Card>

      <Card className="space-y-2" data-testid="totais-orcamento">
        <Row label="Subtotal" value={totals ? formatBRL(totals.subtotal) : "—"} />
        {totals && totals.discountTotal > 0 && <Row label="Desconto" value={`- ${formatBRL(totals.discountTotal)}`} />}
        <div className="flex items-baseline justify-between border-t border-line pt-2">
          <span className="font-semibold">Total</span>
          <span className="num text-2xl font-semibold text-accent-strong">{totals ? formatBRL(totals.total) : "—"}</span>
        </div>
        <p className="text-xs text-muted">O servidor refaz estas contas ao salvar.</p>
      </Card>

      <FormMessage error={error} />
      <div className="sticky bottom-20 z-10 flex gap-3 lg:bottom-4">
        <Button onClick={submit} disabled={pending} className="shadow-lg">
          <Plus size={16} />{pending ? "Salvando…" : initial ? "Salvar alterações" : "Salvar orçamento"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => router.back()} disabled={pending}>Cancelar</Button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted">{label}</span>
      <span className="num">{value}</span>
    </div>
  );
}
