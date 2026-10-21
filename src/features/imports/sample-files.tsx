"use client";

import { useState } from "react";
import { FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Kind = "Completo" | "Incompleto" | "Inválido";

const SAMPLES: { file: string; kind: Kind; title: string; detail: string }[] = [
  { file: "exemplo-sintetico-3mf-completo.3mf", kind: "Completo", title: "3MF com duas placas", detail: "Peso, tempo, material, impressora, peças, suportes e miniatura." },
  { file: "exemplo-sintetico-gcode-prusa.gcode", kind: "Completo", title: "G-code no estilo PrusaSlicer", detail: "Peso, tempo, material, impressora e desperdício de purga." },
  { file: "exemplo-sintetico-gcode-bambu.gcode", kind: "Completo", title: "G-code no estilo Bambu Studio", detail: "Peso, tempo total estimado, material e impressora." },
  { file: "exemplo-sintetico-gcode-so-tempo.gcode", kind: "Incompleto", title: "G-code só com o tempo", detail: "Peso e material ficam em branco para você preencher." },
  { file: "exemplo-sintetico-gcode-cura-sem-peso.gcode", kind: "Incompleto", title: "G-code no estilo Cura", detail: "Traz o tempo, mas não o peso (só o comprimento do filamento)." },
  { file: "exemplo-sintetico-3mf-sem-fatiamento.3mf", kind: "Incompleto", title: "3MF sem fatiamento", detail: "Só geometria: o app avisa que é preciso fatiar." },
  { file: "exemplo-sintetico-3mf-projeto-prusa.3mf", kind: "Incompleto", title: "3MF projeto do PrusaSlicer", detail: "Lê impressora e material; sem peso nem tempo." },
  { file: "exemplo-sintetico-invalido-nao-e-3mf.3mf", kind: "Inválido", title: "Arquivo .3mf que é só texto", detail: "Deve ser recusado." },
  { file: "exemplo-sintetico-invalido-stl.stl", kind: "Inválido", title: "Arquivo STL", detail: "Deve ser recusado com orientação (STL não tem fatiamento)." },
];

const BADGE: Record<Kind, string> = {
  Completo: "bg-import-soft text-import",
  Incompleto: "bg-accent-soft text-accent-strong",
  Inválido: "bg-danger/10 text-danger",
};

/** Exemplos SINTÉTICOS para testar o fluxo sem arquivo real. Carregam o mesmo caminho de um arquivo escolhido pelo usuário. */
export function SampleFiles({ onFile, onError }: { onFile: (file: File) => void; onError: (message: string) => void }) {
  const [loading, setLoading] = useState<string | null>(null);

  async function use(file: string) {
    setLoading(file);
    try {
      const res = await fetch(`/exemplos/${file}`);
      if (!res.ok) throw new Error("download");
      onFile(new File([await res.blob()], file));
    } catch {
      onError("Não foi possível carregar o exemplo. Tente baixar o arquivo e enviá-lo pelo botão acima.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <details className="rounded-2xl border border-dashed border-line bg-surface p-4" data-testid="exemplos">
      <summary className="flex cursor-pointer items-center gap-2 font-medium">
        <FlaskConical size={18} className="text-accent" /> Sem arquivo à mão? Teste com um exemplo sintético
      </summary>
      <p className="mt-3 text-sm text-muted">
        Estes arquivos foram <strong>montados pelo PrintUp</strong> para testar o fluxo. <strong>Não são exportações reais</strong> do MakerWorld nem de nenhum
        programa, e os valores são inventados só para o teste.
      </p>
      <ul className="mt-3 divide-y divide-line">
        {SAMPLES.map((s) => (
          <li key={s.file} className="flex flex-wrap items-center gap-3 py-3">
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                {s.title} <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", BADGE[s.kind])}>{s.kind}</span>
              </span>
              <span className="block text-xs text-muted">{s.detail}</span>
            </span>
            <Button size="sm" variant="secondary" onClick={() => use(s.file)} disabled={loading !== null} data-testid={`exemplo-${s.file}`}>
              {loading === s.file ? "Carregando…" : "Testar agora"}
            </Button>
            <a href={`/exemplos/${s.file}`} download className="text-sm font-medium text-accent-strong underline">Baixar</a>
          </li>
        ))}
      </ul>
    </details>
  );
}
