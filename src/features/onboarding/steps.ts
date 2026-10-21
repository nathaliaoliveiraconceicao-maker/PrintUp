/** Primeiros passos do PrintUp. O progresso é calculado a partir dos dados reais (nada é marcado à mão). */
export interface StepInput {
  printers: number;
  filaments: number;
  hasSettings: boolean;
  pricings: number;
}

export interface Step {
  key: "impressora" | "filamento" | "custos" | "preco";
  title: string;
  detail: string;
  href: string;
  done: boolean;
}

export function gettingStartedSteps(i: StepInput): { steps: Step[]; done: number; total: number; next: Step | null } {
  const steps: Step[] = [
    { key: "impressora", title: "Cadastre sua impressora", detail: "Potência e desgaste da máquina entram no custo.", href: "/impressoras/nova", done: i.printers > 0 },
    { key: "filamento", title: "Cadastre um filamento", detail: "O preço por kg alimenta o custo do material.", href: "/filamentos/novo", done: i.filaments > 0 },
    { key: "custos", title: "Informe seus custos e margem", detail: "Energia, mão de obra, taxas, impostos e a margem que você quer.", href: "/configuracoes", done: i.hasSettings },
    { key: "preco", title: "Calcule e salve seu primeiro preço", detail: "Importe um arquivo ou use a calculadora.", href: "/calculadora", done: i.pricings > 0 },
  ];
  const done = steps.filter((s) => s.done).length;
  return { steps, done, total: steps.length, next: steps.find((s) => !s.done) ?? null };
}
