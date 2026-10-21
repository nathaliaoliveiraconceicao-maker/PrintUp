import Link from "next/link";
import { LogOut, ShieldCheck } from "lucide-react";
import { BottomNav, SideNav } from "@/components/app-nav";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { logout } from "@/features/auth/actions";
import { isAdminQuiet } from "@/features/admin/guard";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const isAdmin = await isAdminQuiet();
  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col justify-between border-r border-line p-5 lg:flex">
        <div className="space-y-8">
          <Logo />
          <SideNav />
        </div>
        <div className="space-y-1">
          {isAdmin && <Link href="/admin" className="flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted hover:bg-paper hover:text-ink"><ShieldCheck size={18} aria-hidden="true" />Administração</Link>}
          <form action={logout}>
            <Button variant="ghost" className="w-full justify-start"><LogOut size={18} />Sair</Button>
          </form>
        </div>
      </aside>
      <div className="min-w-0 flex-1 px-5 pb-24 pt-6 lg:px-10 lg:pb-10">
        <header className="mb-6 flex items-center justify-between lg:hidden">
          <Logo />
          <div className="flex items-center gap-1">
            {isAdmin && <Link href="/admin" aria-label="Administração" className="flex h-9 items-center rounded-xl px-2 text-muted hover:bg-paper"><ShieldCheck size={18} /></Link>}
            <form action={logout}><Button variant="ghost" size="sm"><LogOut size={16} />Sair</Button></form>
          </div>
        </header>
        <main>{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}
