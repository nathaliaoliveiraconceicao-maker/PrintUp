import { costGroups, type CostBreakdown } from "@/lib/pricing";
import { formatBRL, formatPercent } from "@/lib/utils";

const SEGMENTS = [
  { key: "filament", label: "Filamento", color: "var(--accent)" },
  { key: "printer", label: "Impressora", color: "var(--ink)" },
  { key: "additional", label: "Custos adicionais", color: "#8b919a" },
] as const;

/**
 * Composição do custo por unidade numa barra empilhada. A informação nunca depende só da cor:
 * cada bloco tem nome, valor e porcentagem na legenda e a barra tem descrição para leitores de tela.
 */
export function CostChart({ unit, unitCost }: { unit: CostBreakdown; unitCost: number }) {
  const g = costGroups(unit, unitCost);
  const total = g.total > 0 ? g.total : 1;
  const parts = SEGMENTS.map((s) => ({ ...s, value: g[s.key], pct: (g[s.key] / total) * 100 }));
  const summary = parts.map((p) => `${p.label} ${formatPercent(p.pct)}`).join(", ");

  return (
    <div data-testid="grafico-custos" className="space-y-3">
      <div role="img" aria-label={`Composição do custo por unidade: ${summary}`} className="flex h-4 w-full overflow-hidden rounded-full bg-paper">
        {parts.map((p) => p.pct > 0 && <span key={p.key} style={{ width: `${p.pct}%`, background: p.color }} />)}
      </div>
      <ul className="space-y-1.5 text-sm">
        {parts.map((p) => (
          <li key={p.key} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-sm" style={{ background: p.color }} />
              {p.label}
            </span>
            <span className="num">
              {formatBRL(p.value)} <span className="text-muted">· {formatPercent(p.pct)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
