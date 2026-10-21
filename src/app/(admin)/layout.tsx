import Link from "next/link";
import { ArrowLeft, LogOut, ShieldCheck } from "lucide-react";
import { AdminNav } from "@/components/admin-nav";
import { Button } from "@/components/ui/button";
import { logout } from "@/features/auth/actions";
import { requireAdminPage } from "@/features/admin/guard";

export const metadata = { title: "Administração · PrintUp", robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage(); // 404 para quem não é superadmin (o banco confere de novo em cada consulta)
  return (
    <div className="mx-auto min-h-dvh max-w-7xl lg:flex">
      <aside className="border-b border-line p-4 lg:sticky lg:top-0 lg:h-dvh lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r lg:p-5">
        <div className="mb-4 flex items-center justify-between lg:mb-6 lg:block">
          <p className="flex items-center gap-2 text-base font-semibold"><ShieldCheck size={20} className="text-accent-strong" aria-hidden="true" />Administração</p>
          <Link href="/" className="flex h-9 items-center gap-1 text-sm text-muted hover:text-ink lg:mt-3"><ArrowLeft size={16} aria-hidden="true" />Voltar ao app</Link>
        </div>
        <AdminNav />
        <form action={logout} className="mt-4 hidden lg:block"><Button variant="ghost" className="w-full justify-start"><LogOut size={18} />Sair</Button></form>
      </aside>
      <main className="min-w-0 flex-1 px-4 pb-16 pt-6 lg:px-10" data-testid="admin-main">{children}</main>
    </div>
  );
}
