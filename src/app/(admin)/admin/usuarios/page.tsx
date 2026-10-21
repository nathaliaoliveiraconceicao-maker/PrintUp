import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { requireAdminPage } from "@/features/admin/guard";
import { parsePage } from "@/features/admin/schema";
import { loadUsers } from "@/features/admin/server";
import { Badge, fmtDay, fmtDate, Pager, stateLabel, stateTone, Table } from "@/features/admin/ui";
import { STATE_LABEL } from "@/lib/billing/state";

export const metadata = { title: "Usuários · Administração" };
const lim = (used: number, max: number | null) => (max === null ? `${used} / ∞` : `${used} / ${max}`);

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string; plano?: string; estado?: string; pagina?: string }> }) {
  const { supabase } = await requireAdminPage();
  const sp = await searchParams;
  const { page, limit, offset } = parsePage(sp.pagina);
  const q = sp.q?.slice(0, 80);
  const rows = await loadUsers(supabase, { q, plan: sp.plano, state: sp.estado, limit, offset });
  const total = rows[0]?.total ?? 0;
  return (
    <>
      <PageHeader title="Usuários" description="Só contagens e metadados: produtos, arquivos e senhas dos clientes nunca aparecem aqui." />
      <form className="mb-4 grid gap-3 sm:grid-cols-4" role="search">
        <Field label="Buscar (nome ou e-mail)"><Input name="q" defaultValue={q} /></Field>
        <Field label="Plano"><Select name="plano" defaultValue={sp.plano ?? ""}><option value="">Todos</option><option value="gratuito">Gratuito</option><option value="trial">Teste grátis</option><option value="pro">Pro</option><option value="business">Business</option></Select></Field>
        <Field label="Situação"><Select name="estado" defaultValue={sp.estado ?? ""}><option value="">Todas</option>{Object.entries(STATE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <div className="flex items-end"><Button variant="secondary" className="w-full">Filtrar</Button></div>
      </form>
      <Table head={["Cliente", "Cadastro", "Último acesso", "Plano", "Situação", "Produtos", "Impressoras"]} empty={rows.length === 0 ? "Nenhum usuário encontrado." : undefined}>
        {rows.map((u) => (
          <tr key={u.user_id} data-testid="linha-usuario">
            <td className="px-4 py-3"><Link href={`/admin/usuarios/${u.user_id}`} className="font-medium text-accent-strong hover:underline">{u.full_name || u.email}</Link><div className="text-xs text-muted">{u.email}</div></td>
            <td className="px-4 py-3">{fmtDay(u.created_at)}</td>
            <td className="px-4 py-3">{u.last_sign_in_at ? fmtDate(u.last_sign_in_at) : "—"}</td>
            <td className="px-4 py-3">{u.plan_code === "trial" ? "Teste grátis" : u.plan_code}</td>
            <td className="px-4 py-3"><Badge tone={stateTone(u.state)}>{stateLabel(u.state)}</Badge></td>
            <td className="num px-4 py-3">{lim(u.products, u.max_products)}</td>
            <td className="num px-4 py-3">{lim(u.printers, u.max_printers)}</td>
          </tr>
        ))}
      </Table>
      <Pager base="/admin/usuarios" params={{ q, plano: sp.plano, estado: sp.estado }} page={page} total={total} size={limit} />
    </>
  );
}
