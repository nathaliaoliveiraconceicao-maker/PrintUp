import { cn } from "@/lib/utils";

/** Barra de saldo: parte cheia = value / max. Só visual (o número exato vem escrito ao lado). */
export function Meter({ value, max, tone = "ok", label }: { value: number; max: number; tone?: "ok" | "warn" | "danger"; label: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-paper" role="img" aria-label={`${label}: ${Math.round(pct)}%`}>
      <div className={cn("h-full rounded-full transition-all", tone === "ok" && "bg-ok", tone === "warn" && "bg-accent", tone === "danger" && "bg-danger")} style={{ width: `${pct}%` }} />
    </div>
  );
}
