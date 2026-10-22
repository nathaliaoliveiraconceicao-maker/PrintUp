import Link from "next/link";
import { Calculator, ClipboardList, FileText, FileUp, KanbanSquare, Boxes } from "lucide-react";
import { Card } from "@/components/ui/card";

export const metadata = {
  title: { absolute: "PrintUp — precificação e gestão para impressão 3D" },
  description: "Calcule o preço certo das suas peças impressas em 3D, gere orçamentos em PDF e organize pedidos, produção e estoque de filamento. Em português, em reais.",
};

const FEATURES = [
  { icon: Calculator, title: "Preço certo, sem achismo", text: "Material, energia, desgaste da impressora, mão de obra, perdas, taxas e impostos entram na conta. Você vê margem e lucro antes de fechar o preço." },
  { icon: FileUp, title: "Importe do fatiador", text: "Leia arquivos 3MF e G-code direto no navegador para trazer peso e tempo. O que o arquivo não informa fica em branco para você preencher: nada é inventado." },
  { icon: FileText, title: "Orçamentos em PDF", text: "Monte o orçamento com os seus produtos e envie um PDF limpo ao cliente. Custo e margem nunca aparecem no documento dele." },
  { icon: ClipboardList, title: "Pedidos e pagamentos", text: "Transforme o orçamento aprovado em pedido, acompanhe o que já foi recebido e veja o lucro de cada venda concluída." },
  { icon: KanbanSquare, title: "Produção em quadro", text: "Organize o que vai para a impressora, o que está imprimindo e o que está pronto, com registro de falhas." },
  { icon: Boxes, title: "Estoque de filamento", text: "Controle cada bobina: o que está reservado para pedidos, o que sobrou e quando é hora de comprar mais." },
] as const;

const STEPS = [
  ["1", "Cadastre sua impressora e seus filamentos", "O PrintUp calcula o custo da hora e do grama com os seus números."],
  ["2", "Precifique uma peça", "Informe peso e tempo (ou importe o arquivo) e veja preço, margem e lucro."],
  ["3", "Venda e produza com organização", "Gere o orçamento, acompanhe o pedido e baixe o estoque ao concluir."],
] as const;

const FAQ = [
  ["Preciso pagar para começar?", "Não. O plano Gratuito não expira e já inclui a calculadora. Quando o período de teste estiver habilitado, quem cria a conta também experimenta os recursos do plano Pro, sem cartão."],
  ["Funciona no celular?", "Sim. O PrintUp foi pensado para o celular primeiro: dá para consultar preços e pedidos de onde você estiver."],
  ["Meus dados ficam seguros?", "Cada conta só enxerga os próprios dados, e a proteção é aplicada no banco de dados. Você pode voltar ao plano Gratuito a qualquer momento sem perder o que cadastrou."],
  ["O PrintUp emite nota fiscal?", "Ainda não. O foco hoje é precificação, orçamentos, pedidos, produção e estoque."],
] as const;

export default function HomePage() {
  return (
    <div className="space-y-20">
      <section className="mx-auto max-w-3xl space-y-6 pt-4 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Precifique suas impressões 3D com segurança e organize a produção</h1>
        <p className="text-lg text-muted">Do cálculo do preço ao orçamento, ao pedido e ao estoque de filamento. Em português, em reais, feito para quem vive de imprimir.</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/cadastro" className="inline-flex h-12 items-center rounded-xl bg-accent px-7 text-base font-semibold text-ink hover:brightness-95">Criar conta grátis</Link>
          <Link href="/planos" className="inline-flex h-12 items-center rounded-xl border border-line bg-surface px-7 text-base font-medium hover:bg-paper">Ver planos</Link>
        </div>
        <p className="text-sm text-muted">Sem cartão para começar.</p>
      </section>

      <section aria-labelledby="h-recursos" className="space-y-6">
        <h2 id="h-recursos" className="text-center text-2xl font-semibold tracking-tight">Tudo o que o seu negócio de impressão precisa</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <Card key={f.title} className="space-y-3">
              <f.icon size={24} className="text-accent-strong" aria-hidden="true" />
              <h3 className="text-lg font-semibold">{f.title}</h3>
              <p className="text-sm text-muted">{f.text}</p>
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="h-como" className="space-y-6">
        <h2 id="h-como" className="text-center text-2xl font-semibold tracking-tight">Como funciona</h2>
        <ol className="grid gap-4 md:grid-cols-3">
          {STEPS.map(([n, title, text]) => (
            <li key={n} className="flex gap-4 rounded-2xl border border-line bg-surface p-5">
              <span className="num flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-semibold text-paper" aria-hidden="true">{n}</span>
              <div><h3 className="font-semibold">{title}</h3><p className="mt-1 text-sm text-muted">{text}</p></div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="h-faq" className="mx-auto max-w-3xl space-y-4">
        <h2 id="h-faq" className="text-center text-2xl font-semibold tracking-tight">Perguntas frequentes</h2>
        {FAQ.map(([q, a]) => (
          <details key={q} className="group rounded-2xl border border-line bg-surface px-5 py-4">
            <summary className="cursor-pointer list-none text-base font-medium">{q}</summary>
            <p className="mt-2 text-sm text-muted">{a}</p>
          </details>
        ))}
      </section>

      <section className="rounded-3xl bg-ink px-6 py-12 text-center text-paper">
        <h2 className="text-2xl font-semibold tracking-tight">Comece a precificar hoje</h2>
        <p className="mx-auto mt-2 max-w-xl text-paper/80">Crie a sua conta e faça o primeiro cálculo em poucos minutos.</p>
        <Link href="/cadastro" className="mt-6 inline-flex h-12 items-center rounded-xl bg-accent px-7 text-base font-semibold text-ink hover:brightness-95">Criar conta grátis</Link>
      </section>
    </div>
  );
}
