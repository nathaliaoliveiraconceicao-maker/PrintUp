import { Check } from "lucide-react";
import { Logo } from "@/components/logo";

const BENEFITS = ["Custo da placa e de cada peça, sem contar nada duas vezes", "Preço por canal: venda direta, Shopee e Mercado Livre", "Orçamentos em PDF, pedidos, produção e estoque"];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto grid min-h-dvh max-w-6xl items-center gap-8 px-5 py-8 lg:grid-cols-[1.1fr_1fr] lg:gap-14">
      <section className="relative overflow-hidden rounded-3xl bg-ink p-8 text-paper sm:p-10 lg:p-12">
        <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-accent/25 blur-3xl" aria-hidden="true" />
        <div className="relative">
          <Logo className="text-paper [&_span>span]:text-accent" />
          <h1 className="mt-8 text-balance text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
            Saiba quanto <span className="text-accent">cobrar</span> por cada peça que sai da sua impressora.
          </h1>
          <ul className="mt-6 hidden space-y-3 text-paper/85 sm:block">
            {BENEFITS.map((b) => (
              <li key={b} className="flex items-start gap-3"><span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-ink"><Check size={14} aria-hidden="true" /></span>{b}</li>
            ))}
          </ul>
        </div>
      </section>
      <section className="rounded-3xl border border-line bg-surface p-6 shadow-xl shadow-ink/5 sm:p-8 lg:mx-auto lg:w-full lg:max-w-md">{children}</section>
    </main>
  );
}
