import { OffersAdminTabs } from "@/components/offers-admin-tabs";
import { Card, PageHeader } from "@/components/ui/card";
import { requireAdminPage } from "@/features/admin/guard";
import { loadStoresAndSources } from "@/features/offers/admin-data";
import { CouponForm, CouponToggle, ImportForm, RunButtons, SourceForm, StoreForm } from "@/features/offers/admin-forms";
import { ALL_CONNECTORS } from "@/features/offers/connectors/registry";
import { envMissing } from "@/features/offers/connectors/types";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Lojas e fontes · Administração" };
export const maxDuration = 60;

export default async function StoresPage() {
  await requireAdminPage();
  const { stores, sources, coupons } = await loadStoresAndSources();
  const connectors = ALL_CONNECTORS.filter((c) => c.id !== "simulado" || process.env.OFFERS_ALLOW_SIMULATED === "sim").map((c) => ({ id: c.id, label: c.label, status: c.status, missing: envMissing(c, process.env) }));
  return (
    <>
      <PageHeader title="Lojas, fontes e cupons" description="Cada loja tem os domínios permitidos e o seu identificador de afiliado. Fontes buscam os produtos; credenciais ficam só nas variáveis de ambiente do servidor." />
      <OffersAdminTabs current="/admin/ofertas/lojas" />
      <h2 className="mb-3 font-semibold">Lojas</h2>
      <div className="mb-4 space-y-3" data-testid="lojas">{stores.map((s) => <StoreForm key={s.id} store={s} />)}<StoreForm /></div>

      <h2 className="mb-3 mt-8 font-semibold">Fontes de dados</h2>
      <div className="mb-4 space-y-3" data-testid="fontes">
        {sources.map((s) => (
          <Card key={s.id} className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">{s.name} <span className="text-xs text-muted">({s.connector}{s.isActive ? ", ativa" : ", desligada"})</span></p><p className="text-xs text-muted">{s.lastRunAt ? `Última execução: ${formatDateTime(s.lastRunAt.toISOString())}` : "Nunca executada"}</p></div>
            <RunButtons id={s.id} />
            <details className="text-sm"><summary className="min-h-11 cursor-pointer py-2 font-medium text-accent-strong">Editar fonte</summary><SourceForm stores={stores} source={s} connectors={connectors} /></details>
          </Card>
        ))}
        {stores.length > 0 && <Card><h3 className="mb-2 font-semibold">Nova fonte</h3><SourceForm stores={stores} connectors={connectors} /></Card>}
      </div>
      {sources.length > 0 && <ImportForm sources={sources.filter((s) => s.connector === "feed_manual" || s.connector === "simulado")} />}

      <h2 className="mb-3 mt-8 font-semibold">Cupons</h2>
      <div className="space-y-3" data-testid="cupons-ofertas">
        {coupons.length > 0 && (
          <Card><ul className="divide-y divide-line text-sm">{coupons.map((c) => (
            <li key={c.id as string} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span><strong>{c.code as string}</strong> · {(c.offer_stores as { name?: string } | null)?.name} · {c.kind === "percent" ? `${c.value}%` : `R$ ${c.value}`} · origem: {c.source as string}{c.valid_until ? ` · até ${new Date(c.valid_until as string).toLocaleDateString("pt-BR")}` : ""}{c.is_active ? "" : " · desativado"}</span>
              <CouponToggle id={c.id as string} active={Boolean(c.is_active)} />
            </li>))}</ul></Card>
        )}
        {stores.length > 0 && <CouponForm stores={stores} />}
      </div>
    </>
  );
}
