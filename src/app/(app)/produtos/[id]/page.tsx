import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Calculator, ExternalLink, Pencil } from "lucide-react";
import { DeleteButton } from "@/components/delete-button";
import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";
import { deletePricing } from "@/features/products/actions";
import { deleteCatalogProduct } from "@/features/products/catalog-actions";
import { CATALOG_COLUMNS, type CatalogProduct } from "@/features/products/catalog-schema";
import { imageUrls } from "@/features/products/image-urls";
import { ProductButtons, StockEditor } from "@/features/products/product-buttons";
import { loadStaleness } from "@/features/products/queries";
import type { PricingRow } from "@/features/products/schema";
import { signedUrls } from "@/features/imports/storage";
import { printerMatchMessage } from "@/features/imports/printer-match";
import { COST_LABELS } from "@/lib/pricing/labels";
import { createClient } from "@/lib/supabase/server";
import { formatBRL, formatDateTime, formatPercent } from "@/lib/utils";

export const metadata = { title: "Produto" };

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: found } = await supabase.from("products").select(CATALOG_COLUMNS).eq("id", id).maybeSingle();
  if (!found) notFound();
  const product = found as CatalogProduct;
  const [photos, staleMap] = await Promise.all([imageUrls(supabase, [product.photo_path]), loadStaleness(supabase, [product])]);
  const photo = photos.get(product.photo_path ?? "");
  const stale = staleMap.get(id);
  const { data } = await supabase.from("pricings").select("*").eq("product_id", id).order("created_at", { ascending: false });
  const pricings = (data ?? []) as PricingRow[];
  const modelId = product.model_id ?? null;
  const { data: model } = modelId
    ? await supabase.from("imported_models").select("id, title, source, slicer_label, thumb_path, file_name, file_path, file_size").eq("id", modelId).maybeSingle()
    : { data: null };
  const urls = await signedUrls(supabase, [model?.thumb_path as string | null, model?.file_path as string | null]);
  const thumb = urls.get((model?.thumb_path as string | undefined) ?? "");
  const download = urls.get((model?.file_path as string | undefined) ?? "");

  async function remove() {
    "use server";
    await deleteCatalogProduct(id);
    redirect("/produtos");
  }

  return (
    <>
      <Link href="/produtos" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft size={14} /> Produtos
      </Link>
      <PageHeader
        title={product.name}
        description={[product.category, product.archived_at ? "Arquivado" : null].filter(Boolean).join(" · ") || undefined}
        action={
          <div className="flex items-center gap-1">
            <Button asChild variant="secondary"><Link href={`/produtos/${id}/editar`}><Pencil size={16} />Editar</Link></Button>
            <Button asChild variant="secondary"><Link href="/calculadora"><Calculator size={16} />Nova precificação</Link></Button>
            <DeleteButton what={product.name} action={remove} />
          </div>
        }
      />

      <Card className="mb-6 space-y-4" data-testid="ficha-produto">
        <div className="flex gap-4">
          <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-paper text-xs text-muted">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt={`Foto de ${product.name}`} className="h-full w-full object-contain" />
            ) : (
              "sem foto"
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="num text-3xl font-semibold text-accent-strong">{product.sale_price !== null ? formatBRL(product.sale_price) : "Sem preço"}</p>
            <p className="text-xs text-muted">preço de venda</p>
            {product.description && <p className="mt-2 text-sm">{product.description}</p>}
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Stat label="Custo de produção" value={product.production_cost !== null ? formatBRL(product.production_cost) : "—"} />
          <Stat label="Material" value={product.material_cost !== null ? formatBRL(product.material_cost) : "—"} />
          <Stat label="Máquina" value={product.machine_cost !== null ? formatBRL(product.machine_cost) : "—"} />
          <Stat label="Outros custos" value={product.other_costs !== null ? formatBRL(product.other_costs) : "—"} />
          <Stat
            label={product.margin_basis === "bruta" ? "Margem bruta" : "Margem líquida"}
            value={product.margin_percent !== null ? formatPercent(product.margin_percent) : "—"}
          />
          <Stat label="Peso" value={product.weight_g !== null ? `${String(product.weight_g).replace(".", ",")} g` : "—"} />
          <Stat label="Tempo" value={product.print_minutes !== null ? `${Math.floor(product.print_minutes / 60)} h ${Math.round(product.print_minutes % 60)} min` : "—"} />
          <Stat label="Impressora" value={product.printer_name ?? "—"} />
          <Stat label="Filamento" value={[product.filament_type, product.filament_color].filter(Boolean).join(" · ") || "—"} />
        </dl>

        {(product.source_url || product.license_info) && (
          <div className="space-y-1 rounded-xl border border-line bg-paper px-3 py-2 text-sm">
            {product.source_url && (
              <p>
                <strong>Modelo original:</strong>{" "}
                <a href={product.source_url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 font-medium text-accent-strong underline">
                  abrir link <ExternalLink size={12} />
                </a>
              </p>
            )}
            {product.license_info && <p><strong>Licença:</strong> {product.license_info}</p>}
          </div>
        )}

        {stale?.stale && (
          <div className="rounded-xl border border-warn/40 bg-accent-soft/50 px-3 py-2 text-sm" data-testid="aviso-custos">
            <p className="font-medium">Seus custos mudaram desde o último cálculo.</p>
            <p className="text-muted">
              Hoje o custo seria {formatBRL(stale.newCost)} e o preço {formatBRL(stale.newPrice)}. O preço salvo continua {product.sale_price !== null ? formatBRL(product.sale_price) : "como está"} até você recalcular.
            </p>
          </div>
        )}

        <StockEditor id={id} qty={product.stock_qty} />
        <ProductButtons id={id} archived={Boolean(product.archived_at)} stale={stale?.stale} />
      </Card>

      {model && (
        <Card className="mb-6 flex gap-4" data-testid="produto-modelo">
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt="Foto do produto" className="h-24 w-24 shrink-0 rounded-xl border border-line bg-paper object-contain" />
          ) : null}
          <div className="min-w-0 space-y-1 text-sm">
            <p>
              <strong>Modelo de origem:</strong>{" "}
              <Link href={`/importar/${model.id}`} className="font-medium text-accent-strong underline">{model.title as string}</Link>
            </p>
            <p className="text-muted">
              {model.source === "manual" ? "Dados informados manualmente" : `Dados lidos de arquivo${model.slicer_label ? ` · ${model.slicer_label}` : ""}`}
            </p>
            {model.file_path ? (
              <p className="text-muted">
                Arquivo guardado: {model.file_name as string}{" "}
                {download && <a href={download} download className="font-medium text-accent-strong underline">Baixar</a>}
              </p>
            ) : null}
          </div>
        </Card>
      )}
      <h2 className="mb-3 font-semibold">Histórico de preços ({pricings.length})</h2>
      {pricings.length === 0 ? (
        <Card className="text-center text-muted">Este produto ainda não tem precificações.</Card>
      ) : (
        <ul className="space-y-4">
          {pricings.map((p, i) => (
            <li key={p.id}>
              <Card className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted">
                      {formatDateTime(p.created_at)}{i === 0 && " · mais recente"}
                    </p>
                    <p className="num text-3xl font-semibold text-accent-strong">{formatBRL(p.unit_price)}</p>
                    <p className="text-xs text-muted">preço por unidade · lote de {p.quantity}</p>
                  </div>
                  <DeleteButton what="esta precificação" action={deletePricing.bind(null, p.id, id)} />
                </div>
                <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <Stat label="Custo / unid." value={formatBRL(p.unit_cost)} />
                  <Stat label="Lucro / unid." value={formatBRL(p.unit_profit)} />
                  <Stat label="Margem" value={formatPercent(p.margin_percent)} />
                  <Stat label="Markup" value={formatPercent(p.markup_percent)} />
                </dl>
                <p className="text-xs text-muted">
                  {[p.printer_name && `Impressora: ${p.printer_name}`, p.filament_name && `Filamento: ${p.filament_name}`, p.pricing_mode === "margin" ? "Método: margem" : "Método: markup"]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {p.import_info && (
                  <div className="space-y-1 rounded-xl border border-import/30 bg-import-soft/40 px-3 py-2 text-xs" data-testid="origem-preco">
                    <p>
                      <strong>Origem dos dados:</strong> perfil “{p.import_info.profileName}”
                      {p.import_info.modelTitle ? ` do modelo “${p.import_info.modelTitle}”` : ""} · peso{" "}
                      {p.import_info.weightOrigin === null ? "não informado" : p.import_info.weightEdited ? "editado (difere do arquivo)" : p.import_info.weightOrigin === "arquivo" ? "do arquivo" : "informado por você"} · tempo{" "}
                      {p.import_info.timeOrigin === null ? "não informado" : p.import_info.timeEdited ? "editado (difere do arquivo)" : p.import_info.timeOrigin === "arquivo" ? "do arquivo" : "informado por você"}
                    </p>
                    {p.import_info.printerMatch === "diferente" && (
                      <p className="text-warn">
                        {printerMatchMessage("diferente", p.import_info.slicerPrinterName, p.printer_name ?? "impressora escolhida")}
                      </p>
                    )}
                  </div>
                )}
                <details className="text-sm">
                  <summary className="cursor-pointer font-medium text-accent-strong">Composição do custo</summary>
                  <ul className="mt-2 divide-y divide-line">
                    {COST_LABELS.map(([key, label]) => (
                      <li key={key} className="flex justify-between py-1.5">
                        <span className={p.result.unit[key] === 0 ? "text-muted" : ""}>{label}</span>
                        <span className="num">{formatBRL(p.result.unit[key])}</span>
                      </li>
                    ))}
                    <li className="flex justify-between py-1.5 text-muted">
                      <span>Taxas + impostos / unid.</span>
                      <span className="num">{formatBRL(p.result.unitFees + p.result.unitTaxes)}</span>
                    </li>
                  </ul>
                </details>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="num font-medium">{value}</dd>
    </div>
  );
}
