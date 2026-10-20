import { LogOut } from "lucide-react";
import { BottomNav, SideNav } from "@/components/app-nav";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { logout } from "@/features/auth/actions";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col justify-between border-r border-line p-5 lg:flex">
        <div className="space-y-8">
          <Logo />
          <SideNav />
        </div>
        <form action={logout}>
          <Button variant="ghost" className="w-full justify-start"><LogOut size={18} />Sair</Button>
        </form>
      </aside>
      <div className="min-w-0 flex-1 px-5 pb-24 pt-6 lg:px-10 lg:pb-10">
        <header className="mb-6 flex items-center justify-between lg:hidden">
          <Logo />
          <form action={logout}><Button variant="ghost" size="sm"><LogOut size={16} />Sair</Button></form>
        </header>
        <main>{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}
