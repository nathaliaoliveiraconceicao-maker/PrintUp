"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/lib/use-action-form";
import { formatBRL } from "@/lib/utils";
import type { FilamentRow } from "@/features/filaments/schema";
import type { PrinterRow } from "@/features/printers/schema";
import type { CatalogProduct, ProductActionState } from "./catalog-schema";

const num = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n).replace(".", ","));

export function ProductForm({
  product,
  printers,
  filaments,
  categories,
  action,
}: {
  product?: CatalogProduct;
  printers: Pick<PrinterRow, "id" | "name">[];
  filaments: Pick<FilamentRow, "id" | "name" | "material" | "color">[];
  categories: string[];
  action: (s: ProductActionState, f: FormData) => Promise<ProductActionState>;
}) {
  const { state, onSubmit, pending } = useActionForm(action, {} as ProductActionState);
  const e = state.fieldErrors ?? {};
  const fromCalc = Boolean(product?.pricing_id);
  const hours = product?.print_minutes ? Math.floor(product.print_minutes / 60) : 0;
  const mins = product?.print_minutes ? Math.round(product.print_minutes - hours * 60) : 0;

  return (
    <form onSubmit={onSubmit} className="space-y-6" data-testid="form-produto">
      <Card className="space-y-4">
        <h2 className="font-semibold">Identificação</h2>
        <Field label="Nome do produto" error={e.name}>
          <Input name="name" defaultValue={product?.name} placeholder="Ex.: Vaso Voronoi" required maxLength={120} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Categoria" error={e.category} hint="Para filtrar o catálogo. Ex.: Decoração, Utilidades.">
            <Input name="category" defaultValue={product?.category ?? ""} list="categorias" maxLength={60} />
            <datalist id="categorias">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </Field>
          <Field label="Estoque (unidades prontas)" error={e.stockQty}>
            <Input name="stockQty" inputMode="decimal" defaultValue={num(product?.stock_qty ?? 0)} />
          </Field>
        </div>
        <Field label="Descrição" error={e.description} hint="Aparece nos orçamentos, se você quiser.">
          <Textarea name="description" defaultValue={product?.description ?? ""} maxLength={2000} />
        </Field>
      </Card>

      <Card className="space-y-4">
        <h2 className="font-semibold">Produção</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Impressora" error={e.printerId}>
            <Select name="printerId" defaultValue={product?.printer_id ?? ""}>
              <option value="">{product?.printer_name && !product.printer_id ? `${product.printer_name} (excluída)` : "Não informar"}</option>
              {printers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="Filamento cadastrado" error={e.filamentId}>
            <Select name="filamentId" defaultValue={product?.filament_id ?? ""}>
              <option value="">Não informar</option>
              {filaments.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </Select>
          </Field>
          <Field label="Tipo de filamento" error={e.filamentType} hint="Ex.: PLA, PETG. Em branco usa o do filamento escolhido.">
            <Input name="filamentType" defaultValue={product?.filament_type ?? ""} maxLength={60} />
          </Field>
          <Field label="Cor" error={e.filamentColor}>
            <Input name="filamentColor" defaultValue={product?.filament_color ?? ""} maxLength={40} />
          </Field>
          <Field label="Peso (g)" error={e.weightG}>
            <Input name="weightG" inputMode="decimal" defaultValue={num(product?.weight_g)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tempo (horas)" error={e.printHours}><Input name="printHours" inputMode="decimal" defaultValue={hours ? String(hours) : ""} /></Field>
            <Field label="Minutos" error={e.printMinutes}><Input name="printMinutes" inputMode="decimal" defaultValue={mins ? String(mins) : ""} /></Field>
          </div>
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="font-semibold">Custo e preço</h2>
        {fromCalc ? (
          <div className="space-y-2 rounded-xl border border-line bg-paper px-3 py-3 text-sm">
            <p className="text-muted">Os custos vêm do cálculo salvo e só mudam recalculando (assim o histórico fica coerente).</p>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Info label="Material" value={product?.material_cost} />
              <Info label="Máquina" value={product?.machine_cost} />
              <Info label="Outros" value={product?.other_costs} />
              <Info label="Custo total" value={product?.production_cost} strong />
            </dl>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Custo de material (R$)" error={e.materialCost}><Input name="materialCost" inputMode="decimal" defaultValue={num(product?.material_cost)} /></Field>
            <Field label="Custo de máquina (R$)" error={e.machineCost}><Input name="machineCost" inputMode="decimal" defaultValue={num(product?.machine_cost)} /></Field>
            <Field label="Outros custos (R$)" error={e.otherCosts}><Input name="otherCosts" inputMode="decimal" defaultValue={num(product?.other_costs)} /></Field>
          </div>
        )}
        <Field
          label="Preço de venda (R$)"
          error={e.salePrice}
          hint={fromCalc ? "Mudar o preço aqui troca a margem para “bruta” (sem taxas e impostos)." : "A margem exibida é bruta: (preço − custo) ÷ preço, sem taxas e impostos."}
        >
          <Input name="salePrice" inputMode="decimal" defaultValue={num(product?.sale_price)} />
        </Field>
      </Card>

      <Card className="space-y-4">
        <h2 className="font-semibold">Origem e licença</h2>
        <Field label="Link do modelo original" error={e.sourceUrl} hint="Página do modelo (MakerWorld, Printables…). Só guardamos o link.">
          <Input name="sourceUrl" type="url" inputMode="url" defaultValue={product?.source_url ?? ""} placeholder="https://" maxLength={500} />
        </Field>
        <Field label="Licença de uso comercial" error={e.licenseInfo} hint="Anote o que a licença permite. O PrintUp não verifica licenças.">
          <Textarea name="licenseInfo" defaultValue={product?.license_info ?? ""} maxLength={500} className="min-h-16" />
        </Field>
      </Card>

      <FormMessage error={state.error} />
      <div className="flex gap-3">
        <SubmitButton pending={pending}>Salvar produto</SubmitButton>
        <Button asChild variant="secondary"><Link href={product ? `/produtos/${product.id}` : "/produtos"}>Cancelar</Link></Button>
      </div>
    </form>
  );
}

function Info({ label, value, strong }: { label: string; value: number | null | undefined; strong?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`num ${strong ? "font-semibold" : ""}`}>{value === null || value === undefined ? "—" : formatBRL(value)}</dd>
    </div>
  );
}
