import { OffersAdminTabs } from "@/components/offers-admin-tabs";
import { Card, PageHeader } from "@/components/ui/card";
import { requireAdminPage } from "@/features/admin/guard";
import { loadReviewItems, type ReviewItem } from "@/features/offers/admin-data";
import { ReviewButtons } from "@/features/offers/admin-forms";
import { formatBRL, formatPercent } from "@/lib/utils";

export const metadata = { title: "Revisão de ofertas · Administração" };

const FLAG: Record<string, string> = { primeiro_registro: "primeiro registro (sem histórico)", preco_anterior_inflado: "preço anterior suspeito", desconto_extremo: "desconto acima de 70%", sem_link_afiliado: "sem link de afiliado", imagem_ausente: "sem imagem", historico_insuficiente: "histórico insuficiente", sem_estoque: "sem estoque", verificacao_antiga: "verificação antiga", preco_anterior_nao_maior: "preço anterior não é maior" };
const REASON: Record<string, string> = { publicacao_automatica_desligada: "publicação automática desligada", nota_intermediaria: "nota intermediária", nota_alta: "nota alta" };

function Item({ it, actions }: { it: ReviewItem; actions: Parameters<typeof ReviewButtons>[0]["actions"] }) {
  const o = it.offer;
  return (
    <Card className="space-y-2" data-testid="item-revisao">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0"><p className="font-medium">{it.title}</p><p className="text-xs text-muted">{it.storeName}{it.brand ? ` · ${it.brand}` : ""}{o.isSimulated ? " · SIMULADA" : ""}</p></div>
        <div className="text-right"><p className="num text-lg font-semibold">{formatBRL(o.priceCents / 100)}</p>{o.discountPct !== null && <p className="num text-xs text-ok">−{formatPercent(o.discountPct)} ({o.previousBasis === "loja" ? "preço da loja" : "referência observada"})</p>}</div>
      </div>
      <p className="text-xs text-muted">Nota <strong className="text-ink">{o.score}</strong> · {REASON[o.reviewReason ?? ""] ?? o.reviewReason ?? "—"}{o.flags.length ? ` · alertas: ${o.flags.map((f) => FLAG[f] ?? f).join(", ")}` : ""}</p>
      <p className="break-all text-xs text-muted">Link ({o.isAffiliate ? "afiliado" : "comum"}): {o.linkUrl}</p>
      <ReviewButtons id={o.id} actions={actions} />
    </Card>
  );
}

export default async function ReviewPage() {
  await requireAdminPage();
  const [pending, published] = await Promise.all([loadReviewItems("revisao"), loadReviewItems("publicada")]);
  return (
    <>
      <PageHeader title="Revisão de ofertas" description="Aprove ou rejeite o que as regras não puderam decidir sozinhas. Confira o preço e o link na loja antes de aprovar." />
      <OffersAdminTabs current="/admin/ofertas/revisao" />
      <h2 className="mb-3 font-semibold">Aguardando revisão ({pending.length})</h2>
      <div className="mb-8 space-y-3" data-testid="fila-revisao">{pending.length === 0 ? <Card className="text-sm text-muted">Nada aguardando revisão.</Card> : pending.map((it) => <Item key={it.offer.id} it={it} actions={["aprovar", "rejeitar"]} />)}</div>
      <h2 className="mb-3 font-semibold">Publicadas ({published.length})</h2>
      <div className="space-y-3" data-testid="lista-publicadas">{published.length === 0 ? <Card className="text-sm text-muted">Nenhuma oferta publicada.</Card> : published.map((it) => <Item key={it.offer.id} it={it} actions={it.offer.featured ? ["remover_destaque", "despublicar"] : ["destacar", "despublicar"]} />)}</div>
    </>
  );
}
