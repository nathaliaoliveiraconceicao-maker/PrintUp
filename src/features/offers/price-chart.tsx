import { dailySeries } from "./history";
import type { Observation } from "./pricing";
import { formatBRL } from "@/lib/utils";

/** Gráfico simples (SVG) de evolução do preço: uma observação por dia (a menor do dia). Sem dados suficientes, não desenha. */
export function PriceChart({ history }: { history: Observation[] }) {
  const pts = dailySeries(history);
  if (pts.length < 2) return <p className="rounded-xl bg-paper px-3 py-6 text-center text-sm text-muted" data-testid="grafico-vazio">Ainda não há observações suficientes para o gráfico (precisamos de pelo menos 2 dias).</p>;
  const W = 640, H = 180, P = 28;
  const xs = pts.map((p) => p.at.getTime()), ys = pts.map((p) => p.priceCents);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const sx = (x: number) => P + ((x - x0) / Math.max(1, x1 - x0)) * (W - 2 * P);
  const sy = (y: number) => H - P - ((y - y0) / Math.max(1, y1 - y0)) * (H - 2 * P);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${sx(p.at.getTime()).toFixed(1)},${sy(p.priceCents).toFixed(1)}`).join(" ");
  const area = `${line} L${sx(x1).toFixed(1)},${H - P} L${sx(x0).toFixed(1)},${H - P} Z`;
  const last = pts[pts.length - 1];
  return (
    <figure data-testid="grafico-preco">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Evolução do preço: de ${formatBRL(pts[0].priceCents / 100)} a ${formatBRL(last.priceCents / 100)} em ${pts.length} dias com observações`}>
        <path d={area} fill="var(--accent-soft)" opacity="0.8" />
        <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p) => <circle key={p.at.toISOString()} cx={sx(p.at.getTime())} cy={sy(p.priceCents)} r="3" fill="var(--accent-strong)" />)}
        <text x={P} y={14} fontSize="11" fill="var(--muted)">{formatBRL(y1 / 100)}</text>
        <text x={P} y={H - 8} fontSize="11" fill="var(--muted)">{formatBRL(y0 / 100)}</text>
        <text x={W - P} y={H - 8} fontSize="11" textAnchor="end" fill="var(--muted)">{pts[0].at.toLocaleDateString("pt-BR")} → {last.at.toLocaleDateString("pt-BR")}</text>
      </svg>
    </figure>
  );
}
