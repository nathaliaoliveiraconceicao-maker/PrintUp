import Link from "next/link";
import { Check, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { gettingStartedSteps, type StepInput } from "./steps";

/** Guia de primeiros passos: some sozinho quando tudo estiver feito. */
export function GettingStarted(input: StepInput) {
  const { steps, done, total, next } = gettingStartedSteps(input);
  if (!next) return null;
  return (
    <Card className="mb-6 space-y-4" data-testid="primeiros-passos">
      <div>
        <h2 className="font-semibold">Primeiros passos</h2>
        <p className="num mt-1 text-sm text-muted">{done} de {total} concluídos</p>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-paper" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={total}>
          <div className="h-full rounded-full bg-accent" style={{ width: `${(done / total) * 100}%` }} />
        </div>
      </div>
      <ol className="space-y-2">
        {steps.map((s) => (
          <li key={s.key} className={cn("flex items-start gap-3 text-sm", s.done && "text-muted")}>
            {s.done ? <Check size={18} className="mt-0.5 shrink-0 text-ok" aria-label="concluído" /> : <Circle size={18} className="mt-0.5 shrink-0 text-line" aria-label="pendente" />}
            <span>
              <span className={cn("font-medium", s.done && "line-through")}>{s.title}</span>
              {!s.done && <span className="block text-xs text-muted">{s.detail}</span>}
            </span>
          </li>
        ))}
      </ol>
      <Button asChild><Link href={next.href}>{next.title}</Link></Button>
    </Card>
  );
}
