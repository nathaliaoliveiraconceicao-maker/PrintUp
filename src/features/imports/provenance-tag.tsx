import { cn } from "@/lib/utils";
import type { ProvenanceTag } from "./provenance";

const STYLES: Record<ProvenanceTag, string> = {
  "do arquivo": "bg-import-soft text-import",
  editado: "bg-accent-soft text-accent-strong",
  "informado por você": "border border-line bg-paper text-muted",
  "em branco": "border border-dashed border-line text-muted",
};

/** Etiqueta de origem do dado. Cor fria = veio do arquivo; laranja = corrigido; neutra = digitado ou ausente. */
export function Tag({ value, className }: { value: ProvenanceTag; className?: string }) {
  return <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium leading-4", STYLES[value], className)}>{value}</span>;
}
