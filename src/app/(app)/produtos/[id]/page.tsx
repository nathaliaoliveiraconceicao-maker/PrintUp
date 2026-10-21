import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Calculator } from "lucide-react";
import { DeleteButton } from "@/components/delete-button";
import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";
import { deletePricing, deleteProduct } from "@/features/products/actions";
import type { PricingRow, ProductRow } from "@/features/products/schema";
import { signedUrls } from "@/features/imports/storage";
import { printerMatchMessage } from "@/features/imports/printer-match";
import { COST_LABELS } from "@/lib/pricing/labels";
import { createClient } from "@/lib/supabase/server";
import { formatBRL, formatDateTime, formatPercent } from "@/lib/utils";

export const metadata = { title: "Produto" };

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: product } = await supabase.from("products").select("id, name, notes, created_at, model_id").eq("id", id).maybeSingle();
  if (!product) notFound();
  const { data } = await supabase.from("pricings").select("*").eq("product_id", id).order("created_at", { ascending: false });
  const pricings = (data ?? []) as PricingRow[];
  const modelId = (product as ProductRow).model_id ?? null;
  const { data: model } = modelId
    ? await supabase.from("imported_models").select("id, title, source, slicer_label, thumb_path, file_name, file_path, file_size").eq("id", modelId).maybeSingle()
    : { data: null };
  const urls = await signedUrls(supabase, [model?.thumb_path as string | null, model?.file_path as string | null]);
  const thumb = urls.get((model?.thumb_path as string | undefined) ?? "");
  const download = urls.get((model?.file_path as string | undefined) ?? "");

  async function remove() {
    "use server";
    await deleteProduct(id);
    redirect("/produtos");
  }

  return (
    <>
      <Link href="/produtos" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft size={14} /> Produtos
      </Link>
      <PageHeader
        title={(product as ProductRow).name}
        description={`${pricings.length} precificação(ões) salva(s)`}
        action={
          <div className="flex items-center gap-1">
            <Button asChild><Link href="/calculadora"><Calculator size={18} />Nova precificação</Link></Button>
            <DeleteButton what={(product as ProductRow).name} action={remove} />
          </div>
        }
      />
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
