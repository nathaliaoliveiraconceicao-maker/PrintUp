"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { FileText, Link2, PencilLine, Box } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ImportReview, type RegisteredPrinter } from "./import-review";
import { parseBlob } from "./parse-file";
import { SampleFiles } from "./sample-files";
import type { ParsedModel } from "./types";

type Stage =
  | { kind: "choose" }
  | { kind: "reading"; name: string }
  | { kind: "rejected"; name: string; message: string }
  | { kind: "review"; file: File; model: ParsedModel };

const OPTION = "flex w-full items-start gap-3 rounded-2xl border border-line bg-surface p-4 text-left hover:border-accent focus-visible:outline-2 focus-visible:outline-accent";

/** Tela "Importar modelo": quatro caminhos (3MF, G-code, manual e link de qualquer site). A leitura do arquivo acontece no navegador. */
export function ImportWizard({ userId, printers }: { userId: string; printers: RegisteredPrinter[] }) {
  const [stage, setStage] = useState<Stage>({ kind: "choose" });
  const threeMf = useRef<HTMLInputElement>(null);
  const gcode = useRef<HTMLInputElement>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setStage({ kind: "reading", name: file.name });
    const result = await parseBlob(file);
    setStage(result.status === "ok" ? { kind: "review", file, model: result.model } : { kind: "rejected", name: file.name, message: result.message });
  }
  // Limpa o valor para permitir escolher o mesmo arquivo de novo.
  const openThreeMf = () => {
    if (threeMf.current) threeMf.current.value = "";
    threeMf.current?.click();
  };
  const openGcode = () => {
    if (gcode.current) gcode.current.value = "";
    gcode.current?.click();
  };

  if (stage.kind === "review") {
    return <ImportReview file={stage.file} model={stage.model} userId={userId} printers={printers} onCancel={() => setStage({ kind: "choose" })} />;
  }

  return (
    <div className="space-y-4">
      <input ref={threeMf} type="file" accept=".3mf" hidden data-testid="input-3mf" onChange={(e) => onFile(e.target.files?.[0])} />
      <input ref={gcode} type="file" accept=".gcode,.gco" hidden data-testid="input-gcode" onChange={(e) => onFile(e.target.files?.[0])} />

      <div className="grid gap-3 sm:grid-cols-2">
        <button type="button" className={OPTION} onClick={openThreeMf}>
          <Box className="mt-0.5 shrink-0 text-accent" />
          <span>
            <span className="block font-medium">Arquivo 3MF</span>
            <span className="block text-sm text-muted">Lê peso, tempo, material e impressora quando o arquivo foi fatiado.</span>
          </span>
        </button>
        <button type="button" className={OPTION} onClick={openGcode}>
          <FileText className="mt-0.5 shrink-0 text-accent" />
          <span>
            <span className="block font-medium">Arquivo G-code</span>
            <span className="block text-sm text-muted">Lê os dados gravados pelo fatiador no começo e no fim do arquivo.</span>
          </span>
        </button>
        <Link href="/importar/novo" className={OPTION}>
          <PencilLine className="mt-0.5 shrink-0 text-accent" />
          <span>
            <span className="block font-medium">Informar manualmente</span>
            <span className="block text-sm text-muted">Digite peso, tempo e material, sem arquivo.</span>
          </span>
        </Link>
        <Link href="/importar/link" className={OPTION}>
          <Link2 className="mt-0.5 shrink-0 text-accent" />
          <span>
            <span className="block font-medium">Guardar o link de um modelo</span>
            <span className="block text-sm text-muted">De qualquer site (MakerWorld, Printables, Thingiverse…). O PrintUp guarda o link como referência; peso e tempo você informa.</span>
          </span>
        </Link>
      </div>

      <SampleFiles onFile={onFile} onError={(message) => setStage({ kind: "rejected", name: "exemplo", message })} />

      {stage.kind === "reading" && (
        <Card role="status" className="text-sm">Lendo “{stage.name}”…</Card>
      )}
      {stage.kind === "rejected" && (
        <Card role="alert" className="border-danger/30 bg-danger/5 text-sm">
          <p className="font-medium text-danger">Não foi possível importar “{stage.name}”.</p>
          <p className="mt-1">{stage.message}</p>
        </Card>
      )}
      <p className="text-xs text-muted">O arquivo é lido no seu navegador. Só as informações que você confirmar são salvas, e o arquivo original só é guardado se você pedir (limite de 50 MB por arquivo).</p>
    </div>
  );
}
