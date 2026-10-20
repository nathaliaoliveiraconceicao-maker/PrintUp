import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col justify-center gap-10 px-5 py-10 md:flex-row md:items-center md:gap-20">
      <section className="md:w-1/2">
        <Logo />
        <h1 className="mt-8 text-balance text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
          Saiba quanto <span className="text-accent">cobrar</span> por cada peça que sai da sua impressora.
        </h1>
        <p className="mt-4 max-w-md text-muted">
          Custo de filamento, energia, máquina, mão de obra, taxas e impostos — sem contar nada duas vezes.
        </p>
      </section>
      <section className="rounded-3xl border border-line bg-surface p-6 shadow-sm md:w-[26rem] md:p-8">{children}</section>
    </main>
  );
}
