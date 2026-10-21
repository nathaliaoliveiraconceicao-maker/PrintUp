import { cn } from "@/lib/utils";
import { STATUS_LABEL, type QuoteStatus } from "./status";

const TONE: Record<QuoteStatus, string> = {
  rascunho: "bg-paper text-muted border-line",
  enviado: "bg-import-soft text-import border-import/30",
  aprovado: "bg-ok/10 text-ok border-ok/30",
  recusado: "bg-danger/10 text-danger border-danger/30",
  expirado: "bg-accent-soft text-warn border-warn/30",
};

export function StatusBadge({ status }: { status: QuoteStatus }) {
  return <span className={cn("inline-flex h-6 items-center rounded-full border px-2.5 text-xs font-medium", TONE[status])}>{STATUS_LABEL[status]}</span>;
}
