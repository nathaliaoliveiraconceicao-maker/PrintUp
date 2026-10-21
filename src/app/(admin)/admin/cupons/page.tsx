import { PageHeader } from "@/components/ui/card";
import { CouponForm, CouponToggle } from "@/features/admin/forms";
import { requireAdminPage } from "@/features/admin/guard";
import { loadCoupons, loadPlans } from "@/features/admin/server";
import { Badge, fmtDate, Table } from "@/features/admin/ui";

export const metadata = { title: "Cupons · Administração" };
const TONE = { ativo: "ok", agendado: "warn", expirado: "neutral", esgotado: "neutral", desativado: "danger" } as const;

export default async function CouponsPage() {
  const { supabase } = await requireAdminPage();
  const [coupons, plans] = await Promise.all([loadCoupons(supabase), loadPlans(supabase)]);
  return (
    <>
      <PageHeader title="Cupons e acessos promocionais" description="Teste grátis, cortesia e convites: liberam um plano por N dias, com validade, limite de usos e registro de auditoria. Cada pessoa usa um cupom uma vez." />
      <CouponForm plans={plans.filter((p) => p.is_active && p.code !== "gratuito").map((p) => ({ code: p.code, name: p.name }))} />
      <h2 className="mb-2 mt-8 font-semibold">Cupons criados</h2>
      <Table head={["Código", "Plano", "Dias", "Usos", "Validade", "Convite", "Situação", ""]} empty={coupons.length === 0 ? "Nenhum cupom ainda." : undefined}>
        {coupons.map((c) => (
          <tr key={c.id} data-testid="linha-cupom">
            <td className="px-4 py-3"><span className="num font-medium">{c.code}</span>{c.description && <div className="text-xs text-muted">{c.description}</div>}</td>
            <td className="px-4 py-3">{c.plan_code}</td>
            <td className="num px-4 py-3">{c.days}</td>
            <td className="num px-4 py-3">{c.redeemed_count}{c.max_redemptions ? ` / ${c.max_redemptions}` : " / ∞"}</td>
            <td className="px-4 py-3 text-xs">{fmtDate(c.valid_from)}<br />{c.valid_until ? `até ${fmtDate(c.valid_until)}` : "sem fim"}</td>
            <td className="px-4 py-3 text-xs">{c.restricted_email ?? "—"}</td>
            <td className="px-4 py-3"><Badge tone={TONE[c.status as keyof typeof TONE] ?? "neutral"}>{c.status}</Badge></td>
            <td className="px-4 py-3"><CouponToggle id={c.id} active={c.is_active} /></td>
          </tr>
        ))}
      </Table>
    </>
  );
}
