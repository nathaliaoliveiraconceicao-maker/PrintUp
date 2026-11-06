import Link from "next/link";
import { cn } from "@/lib/utils";

const TONE = { neutral: "border-l-line", ok: "border-l-ok", warn: "border-l-warn", danger: "border-l-danger" } as const;
const VALUE = { neutral: "", ok: "text-ok", warn: "text-warn", danger: "text-danger" } as const;

/** Indicador pequeno de resumo: rótulo, número em destaque e faixa colorida na lateral conforme o tom. */
export function StatTile({ label, value, tone = "neutral", href, detail }: { label: string; value: string; tone?: keyof typeof TONE; href?: string; detail?: string }) {
  const inner = (
    <div className={cn("h-full rounded-2xl border border-l-4 border-line bg-surface p-4 shadow-[0_1px_2px_rgba(28,31,36,0.04)]", TONE[tone], href && "transition hover:-translate-y-0.5 hover:border-accent hover:shadow-md")}>
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={cn("num mt-1 text-3xl font-semibold leading-none", VALUE[tone])}>{value}</p>
      {detail && <p className="mt-1.5 text-xs text-muted">{detail}</p>}
    </div>
  );
  return href ? <Link href={href} className="block h-full">{inner}</Link> : inner;
}
