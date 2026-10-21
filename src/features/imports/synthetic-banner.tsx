import { FlaskConical } from "lucide-react";
import { SYNTHETIC_NOTE } from "./notes";

/** Aviso fixo para arquivos de exemplo: deixa claro que NÃO são exportações reais de nenhum programa. */
export function SyntheticBanner() {
  return (
    <p role="status" data-testid="aviso-sintetico" className="flex gap-2 rounded-xl border border-dashed border-accent/50 bg-accent-soft/60 px-3 py-2 text-sm">
      <FlaskConical size={16} className="mt-0.5 shrink-0 text-accent-strong" />
      <span>{SYNTHETIC_NOTE}</span>
    </p>
  );
}
