import { OffersAdminTabs } from "@/components/offers-admin-tabs";
import { Card, PageHeader } from "@/components/ui/card";
import { requireAdminPage } from "@/features/admin/guard";
import { loadAffiliateReport } from "@/features/offers/admin-data";
import { ConversionForm } from "@/features/offers/admin-forms";
import { formatBRL } from "@/lib/utils";

export const metadata = { title: "Afiliados e cliques · Administração" };

export default async function AffiliatesPage() {
  await requireAdminPage();
  const r = await loadAffiliateReport();
  return (
    <>
      <PageHeader title="Afiliados e cliques" description="Três coisas diferentes: cliques (medidos pelo PrintUp), conversões informadas e comissões confirmadas (vindas do relatório do programa, digitadas por você)." />
      <OffersAdminTabs current="/admin/ofertas/afiliados" />
      <div className="mb-6 grid gap-3 sm:grid-cols-3" data-testid="metricas-afiliados">
        <Card className="p-4"><p className="text-xs text-muted">Cliques nos últimos 30 dias</p><p className="num text-2xl font-semibold">{r.total30d}</p><p className="text-xs text-muted">Podem incluir robôs; não são vendas.</p></Card>
        <Card className="p-4"><p className="text-xs text-muted">Comissão informada (não confirmada)</p><p className="num text-2xl font-semibold">{formatBRL(r.comissaoInformadaCents / 100)}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted">Comissão confirmada pelo programa</p><p className="num text-2xl font-semibold text-ok">{formatBRL(r.comissaoConfirmadaCents / 100)}</p></Card>
      </div>
      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card><h3 className="mb-2 font-semibold">Por loja</h3>{r.porLoja.length === 0 ? <p className="text-sm text-muted">Sem cliques.</p> : <ul className="text-sm">{r.porLoja.map((x) => <li key={x.loja} className="flex justify-between py-1"><span>{x.loja}</span><span className="num">{x.cliques}</span></li>)}</ul>}</Card>
        <Card><h3 className="mb-2 font-semibold">Por origem</h3>{r.porOrigem.length === 0 ? <p className="text-sm text-muted">Sem cliques.</p> : <ul className="text-sm">{r.porOrigem.map((x) => <li key={x.origem} className="flex justify-between py-1"><span>{x.origem}</span><span className="num">{x.cliques}</span></li>)}</ul>}</Card>
        <Card><h3 className="mb-2 font-semibold">Ofertas mais clicadas</h3>{r.top.length === 0 ? <p className="text-sm text-muted">Sem cliques.</p> : <ul className="text-sm">{r.top.map((x, i) => <li key={i} className="flex justify-between gap-2 py-1"><span className="truncate">{x.titulo}</span><span className="num">{x.cliques}</span></li>)}</ul>}</Card>
      </div>
      <ConversionForm stores={r.stores} />
      <Card className="mt-4" data-testid="conversoes">
        <h3 className="mb-2 font-semibold">Resultados registrados</h3>
        {r.conversions.length === 0 ? <p className="text-sm text-muted">Nada registrado ainda.</p> : <ul className="divide-y divide-line text-sm">{r.conversions.map((c) => <li key={c.id as string} className="flex flex-wrap justify-between gap-2 py-2"><span>{c.reported_on as string} · {c.storeName} · {c.orders as number} pedidos</span><span className="num">{formatBRL(Number(c.commission_cents) / 100)} <span className="text-xs text-muted">({c.status as string})</span></span></li>)}</ul>}
      </Card>
    </>
  );
}
