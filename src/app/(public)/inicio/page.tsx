import Link from "next/link";
import { ArrowRight, Boxes, Calculator, Check, ClipboardList, FileText, FileUp, KanbanSquare, Smartphone, Store } from "lucide-react";

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
  { icon: Store, title: "Vitrine para os clientes", text: "Compartilhe um link com os produtos que você tem em estoque e os preços. O cliente vê, você não expõe custo nem margem." },
] as const;

const STEPS = [
  ["1", "Cadastre sua impressora e seus filamentos", "O PrintUp calcula o custo da hora e do grama com os seus números."],
  ["2", "Precifique uma peça", "Informe peso e tempo (ou importe o arquivo) e veja preço, margem e lucro."],
  ["3", "Venda e produza com organização", "Gere o orçamento, acompanhe o pedido e baixe o estoque ao concluir."],
] as const;

const FAQ = [
  ["Preciso pagar para começar?", "Não. O plano Gratuito não expira e já inclui a calculadora."],
  ["Funciona no celular?", "Sim. O PrintUp foi pensado para o celular primeiro: dá para consultar preços e pedidos de onde você estiver."],
  ["Meus dados ficam seguros?", "Cada conta só enxerga os próprios dados, e a proteção é aplicada no banco de dados. Você pode voltar ao plano Gratuito a qualquer momento sem perder o que cadastrou."],
  ["O PrintUp emite nota fiscal?", "Ainda não. O foco hoje é precificação, orçamentos, pedidos, produção e estoque."],
] as const;

const BTN = "inline-flex h-12 items-center justify-center gap-2 rounded-xl px-7 text-base font-semibold transition hover:-translate-y-0.5";

/** Exemplo ilustrativo (não são dados reais): mostra o que a calculadora entrega. */
function ExampleCard() {
  const rows = [["Filamento", "R$ 8,82"], ["Energia elétrica", "R$ 1,29"], ["Desgaste da impressora", "R$ 2,10"], ["Reserva para falhas", "R$ 0,64"]];
  return (
    <div className="relative mx-auto w-full max-w-md" aria-hidden="true">
      <div className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-[radial-gradient(closest-side,rgba(242,106,27,0.28),transparent)]" />
      <div className="rounded-3xl bg-dark p-6 text-on-dark shadow-2xl ring-1 ring-white/10">
        <div className="flex items-center justify-between text-xs text-on-dark/60"><span>Preço sugerido por peça</span><span className="rounded-full bg-white/10 px-2 py-0.5">exemplo</span></div>
        <p className="num mt-2 text-5xl font-semibold tracking-tight text-white">R$ 47,00</p>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-xl bg-white/10 p-2"><p className="text-on-dark/60">Placa</p><p className="num text-sm font-semibold text-white">R$ 62,00</p></div>
          <div className="rounded-xl bg-white/10 p-2"><p className="text-on-dark/60">Custo/peça</p><p className="num text-sm font-semibold text-white">R$ 15,50</p></div>
          <div className="rounded-xl bg-accent p-2 text-on-accent"><p className="opacity-70">Lucro/peça</p><p className="num text-sm font-bold">R$ 31,50</p></div>
        </div>
        <ul className="mt-4 divide-y divide-white/10 text-sm">
          {rows.map(([k, v]) => <li key={k} className="flex justify-between py-1.5 text-on-dark/80"><span>{k}</span><span className="num">{v}</span></li>)}
        </ul>
        <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-xl border border-white/15 p-3"><p className="text-xs text-on-dark/60">Shopee</p><p className="num font-semibold text-white">R$ 61,00</p></div>
          <div className="rounded-xl border border-white/15 p-3"><p className="text-xs text-on-dark/60">Mercado Livre</p><p className="num font-semibold text-white">R$ 56,00</p></div>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="space-y-24">
      <section className="grid items-center gap-12 pt-2 lg:grid-cols-[1.05fr_1fr]">
        <div className="space-y-6">
          <p className="inline-flex items-center gap-2 rounded-full bg-accent-soft px-3 py-1 text-sm font-medium text-accent-strong"><span className="h-2 w-2 rounded-full bg-accent" aria-hidden="true" />Feito para quem vive de imprimir em 3D</p>
          <h1 className="text-balance text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">Saiba o <span className="text-accent-strong">preço certo</span> de cada peça. Venda com lucro.</h1>
          <p className="max-w-xl text-lg text-muted">Calcule o custo da placa e de cada unidade, gere orçamentos em PDF e organize pedidos, produção e estoque de filamento. Em português, em reais.</p>
          <div className="flex flex-wrap gap-3">
            <Link href="/cadastro" className={`${BTN} bg-accent text-on-accent shadow-lg shadow-accent/30 hover:brightness-95`}>Criar conta grátis<ArrowRight size={18} aria-hidden="true" /></Link>
            <Link href="/planos" className={`${BTN} border border-line bg-surface hover:bg-paper`}>Ver planos</Link>
          </div>
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
            {["Sem cartão para começar", "Plano gratuito sem prazo", "Funciona no celular"].map((t) => <li key={t} className="flex items-center gap-1.5"><Check size={16} className="text-ok" aria-hidden="true" />{t}</li>)}
          </ul>
        </div>
        <ExampleCard />
      </section>

      <section aria-labelledby="h-recursos" className="space-y-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 id="h-recursos" className="text-3xl font-bold tracking-tight">Tudo o que o seu negócio de impressão precisa</h2>
          <p className="mt-2 text-muted">Do primeiro cálculo à entrega do pedido, num lugar só.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <article key={f.title} className={`group rounded-3xl border p-6 transition hover:-translate-y-1 hover:shadow-xl hover:shadow-black/5 ${i === 0 ? "border-dark bg-dark text-on-dark lg:col-span-2" : i === FEATURES.length - 1 ? "border-line bg-surface hover:border-accent lg:col-span-2" : "border-line bg-surface hover:border-accent"}`}>
              <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${i === 0 ? "bg-accent" : "bg-accent-soft"}`}><f.icon size={24} className={i === 0 ? "text-on-accent" : "text-accent-strong"} aria-hidden="true" /></span>
              <h3 className="mt-4 text-xl font-semibold">{f.title}</h3>
              <p className={`mt-2 text-sm leading-relaxed ${i === 0 ? "text-on-dark/75 lg:max-w-xl lg:text-base" : "text-muted"}`}>{f.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="h-como" className="space-y-8">
        <h2 id="h-como" className="text-center text-3xl font-bold tracking-tight">Como funciona</h2>
        <ol className="grid gap-6 md:grid-cols-3">
          {STEPS.map(([n, title, text]) => (
            <li key={n} className="relative rounded-3xl border border-line bg-surface p-6">
              <span className="num absolute -top-4 left-6 flex h-9 w-9 items-center justify-center rounded-full bg-accent text-base font-bold text-on-accent shadow-md" aria-hidden="true">{n}</span>
              <h3 className="mt-3 text-lg font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-muted">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-label="Para quem é" className="grid gap-4 rounded-3xl border border-line bg-surface p-6 sm:grid-cols-3 sm:p-8">
        {[[Calculator, "Quem imprime e vende", "Sabe quanto cobrar em cada canal: venda direta, Shopee ou Mercado Livre."], [Smartphone, "Quem trabalha pelo celular", "Consulta preço e pedido de onde estiver, com botões fáceis de tocar."], [Store, "Quem quer mostrar o que tem", "Manda um link da vitrine e o cliente vê produtos, fotos e preços."]].map(([Icon, t, d]) => {
          const I = Icon as typeof Calculator;
          return <div key={t as string} className="flex gap-3"><I size={22} className="mt-0.5 shrink-0 text-accent-strong" aria-hidden="true" /><div><h3 className="font-semibold">{t as string}</h3><p className="mt-1 text-sm text-muted">{d as string}</p></div></div>;
        })}
      </section>

      <section aria-labelledby="h-faq" className="mx-auto max-w-3xl space-y-4">
        <h2 id="h-faq" className="text-center text-3xl font-bold tracking-tight">Perguntas frequentes</h2>
        {FAQ.map(([q, a]) => (
          <details key={q} className="group rounded-2xl border border-line bg-surface px-5 py-4 open:border-accent">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-base font-medium">{q}<span className="text-accent-strong transition group-open:rotate-45" aria-hidden="true">+</span></summary>
            <p className="mt-2 text-sm text-muted">{a}</p>
          </details>
        ))}
      </section>

      <section className="relative overflow-hidden rounded-3xl bg-dark px-6 py-14 text-center text-on-dark">
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-accent/25 blur-3xl" aria-hidden="true" />
        <h2 className="relative text-3xl font-bold tracking-tight">Comece a precificar hoje</h2>
        <p className="relative mx-auto mt-2 max-w-xl text-on-dark/80">Crie a sua conta e faça o primeiro cálculo em poucos minutos.</p>
        <Link href="/cadastro" className={`${BTN} relative mt-6 bg-accent text-on-accent hover:brightness-95`}>Criar conta grátis<ArrowRight size={18} aria-hidden="true" /></Link>
      </section>
    </div>
  );
}
