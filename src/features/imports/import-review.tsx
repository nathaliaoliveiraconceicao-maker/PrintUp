"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { createClient } from "@/lib/supabase/client";
import { buildDrafts, defaultTitle, type ProfileDraft } from "./drafts";
import { saveImport } from "./actions";
import { BUCKET, filePath, thumbPath, uuid4 } from "./paths";
import { splitNotes } from "./notes";
import { comparePrinters, printerMatchMessage } from "./printer-match";
import { buildReadingReport } from "./report";
import { SyntheticBanner } from "./synthetic-banner";
import {
  minutesFromValues,
  originalFromDraft,
  toProfileInput,
  valuesFromDraft,
  type ProfileMeta,
  type ProfileOriginal,
  type ProfileValues,
} from "./profile-values";
import { ProfileFields, type FieldTags } from "./profile-fields";
import { provenanceTag } from "./provenance";
import type { ParsedModel } from "./types";
import { parseDecimal } from "@/lib/utils";

export interface RegisteredPrinter {
  id: string;
  name: string;
  brand: string | null;
  model: string | null;
}

const num = (s: string): number | null => {
  const n = parseDecimal(s);
  return s.trim() === "" || Number.isNaN(n) ? null : n;
};

function tagsFor(v: ProfileValues, o: ProfileOriginal): FieldTags {
  const t = minutesFromValues(v);
  return {
    weight: provenanceTag(o.weightG, num(v.weightG)),
    time: provenanceTag(o.printMinutes, Number.isNaN(t) ? null : t),
    pieces: provenanceTag(o.pieceCount, num(v.pieceCount)),
    printer: provenanceTag(o.slicerPrinterName, v.slicerPrinterName.trim() || null),
    material: provenanceTag(o.filamentType, v.filamentType.trim() || null),
    support: provenanceTag(o.supportUsed, v.support === "" ? null : v.support === "sim"),
    waste: provenanceTag(o.wasteG, num(v.wasteG)),
  };
}

const metaFor = (d: ProfileDraft, m: ParsedModel): ProfileMeta => ({
  plateIndex: d.plateIndex,
  printerModelCode: m.printerModelCode,
  nozzleMm: m.nozzleMm,
  layerHeightMm: m.layerHeightMm,
  materials: d.materials.length > 0 ? d.materials : null,
  rawMeta: m.rawMeta,
});

const FAMILY_NAME: Record<ParsedModel["slicerFamily"], string> = {
  bambu: "Bambu Studio",
  orca: "OrcaSlicer",
  prusa: "PrusaSlicer",
  cura: "Cura",
  unknown: "programa não identificado",
};

/** Ficha do arquivo lido: tudo editável, com a origem de cada dado, avisos do que faltou e envio de miniatura/arquivo. */
export function ImportReview({
  file,
  model,
  userId,
  printers,
  onCancel,
}: {
  file: File;
  model: ParsedModel;
  userId: string;
  printers: RegisteredPrinter[];
  onCancel: () => void;
}) {
  const router = useRouter();
  const drafts = useMemo(() => buildDrafts(model), [model]);
  const originals = useMemo(() => Object.fromEntries(drafts.map((d) => [d.key, originalFromDraft(d, model.printerName)])), [drafts, model]);

  const [title, setTitle] = useState(() => defaultTitle(model, file.name));
  const [selected, setSelected] = useState<Set<string>>(() => new Set(drafts.map((d) => d.key)));
  const [values, setValues] = useState<Record<string, ProfileValues>>(() => Object.fromEntries(drafts.map((d) => [d.key, valuesFromDraft(d, model.printerName)])));
  const [errors, setErrors] = useState<Record<string, Partial<Record<keyof ProfileValues, string>>>>({});
  const [storeFile, setStoreFile] = useState(false);
  const [printerId, setPrinterId] = useState(() => {
    const hit = printers.find((p) => comparePrinters(model.printerName, p) === "igual");
    return hit?.id ?? printers[0]?.id ?? "";
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  // URL temporária da miniatura (criada uma vez; liberada ao sair da ficha).
  const [thumbUrl] = useState<string | null>(() =>
    model.thumbnail ? URL.createObjectURL(new Blob([model.thumbnail as BlobPart], { type: "image/png" })) : null,
  );
  useEffect(() => () => { if (thumbUrl) URL.revokeObjectURL(thumbUrl); }, [thumbUrl]);

  const chosen = printers.find((p) => p.id === printerId) ?? null;
  const notes = useMemo(() => splitNotes(model.notes), [model.notes]);
  const report = useMemo(() => buildReadingReport(model, { name: file.name, size: file.size }), [model, file]);
  const [copied, setCopied] = useState<"sim" | "falhou" | null>(null);
  async function copyReport() {
    try {
      await navigator.clipboard.writeText(report);
      setCopied("sim");
    } catch {
      setCopied("falhou"); // contexto sem permissão: o texto continua selecionável logo abaixo
    }
  }
  const multiple = drafts.length > 1;

  async function save(calcKey?: string) {
    setError(undefined);
    const payloads = [];
    const keys: string[] = [];
    const nextErrors: typeof errors = {};
    for (const d of drafts) {
      if (!selected.has(d.key) && d.key !== calcKey) continue;
      const r = toProfileInput(values[d.key], metaFor(d, model), originals[d.key]);
      if (!r.ok) nextErrors[d.key] = r.errors;
      else {
        payloads.push(r.input);
        keys.push(d.key);
      }
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return setError("Revise os campos destacados.");
    if (payloads.length === 0) return setError("Selecione ao menos uma placa.");

    setSaving(true);
    const supabase = createClient();
    const uploaded: string[] = [];
    try {
      let thumb: string | null = null;
      if (model.thumbnail) {
        const p = thumbPath(userId, uuid4());
        const { error: e } = await supabase.storage.from(BUCKET).upload(p, model.thumbnail, { contentType: "image/png", upsert: false });
        if (!e) {
          thumb = p;
          uploaded.push(p);
        } // falha na miniatura (ex.: limite de espaço) não impede salvar os dados
      }
      let stored: string | null = null;
      if (storeFile) {
        const p = filePath(userId, uuid4(), file.name);
        const { error: e } = await supabase.storage.from(BUCKET).upload(p, file, { contentType: "application/octet-stream", upsert: false });
        if (e) {
          if (uploaded.length) await supabase.storage.from(BUCKET).remove(uploaded);
          setSaving(false);
          return setError("Não foi possível guardar o arquivo original (o limite de armazenamento do seu plano pode ter sido atingido). Desmarque essa opção para salvar só os dados.");
        }
        stored = p;
        uploaded.push(p);
      }

      const res = await saveImport({
        source: "arquivo",
        title,
        designer: model.designer,
        slicerLabel: model.slicerLabel,
        plateCount: model.plateCount,
        parseNotes: model.notes.slice(0, 20),
        fileKind: stored ? model.kind : null,
        fileName: stored ? file.name.slice(0, 200) : null,
        filePath: stored,
        fileSize: null,
        thumbPath: thumb,
        profiles: payloads,
      });
      if (!res.ok || !res.modelId) {
        setSaving(false);
        return setError(res.error ?? "Não foi possível salvar.");
      }
      const idx = calcKey ? keys.indexOf(calcKey) : -1;
      const profileId = idx >= 0 ? res.profileIds?.[idx] : undefined;
      router.push(profileId ? `/calculadora?perfil=${profileId}${printerId ? `&impressora=${printerId}` : ""}` : `/importar/${res.modelId}`);
    } catch {
      if (uploaded.length) await supabase.storage.from(BUCKET).remove(uploaded).catch(() => undefined);
      setSaving(false);
      setError("Não foi possível salvar. Tente novamente.");
    }
  }

  return (
    <div className="space-y-6">
      <Card className="space-y-4">
        <div className="flex gap-4">
          {thumbUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbUrl} alt="Prévia do modelo" className="h-24 w-24 shrink-0 rounded-xl border border-line bg-paper object-contain" />
          ) : (
            <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl border border-dashed border-line text-center text-xs text-muted">sem prévia no arquivo</div>
          )}
          <div className="min-w-0 flex-1 space-y-2">
            <Field label="Nome do produto">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} />
            </Field>
          </div>
        </div>
        <p className="text-sm text-muted" data-testid="origem">
          <strong className="text-ink">Origem dos dados:</strong> arquivo {model.kind === "3mf" ? "3MF" : "G-code"} “{file.name}” · gerado por{" "}
          {model.slicerLabel ?? FAMILY_NAME[model.slicerFamily]}
          {model.designer ? ` · autor: ${model.designer}` : ""}
          {model.plateCount ? ` · ${model.plateCount} placa(s) no projeto` : ""}
        </p>
        {printers.length > 0 && (
          <Field label="Impressora que vai imprimir" hint="Usada para avisar se o tempo foi estimado para outra impressora.">
            <Select value={printerId} onChange={(e) => setPrinterId(e.target.value)}>
              {printers.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </Field>
        )}
      </Card>

      {notes.synthetic && <SyntheticBanner />}

      {notes.rest.length > 0 && (
        <Card className="space-y-2 border-import/30 bg-import-soft/40">
          <p className="flex items-center gap-2 text-sm font-semibold text-import"><Info size={16} /> O que não encontramos no arquivo</p>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {notes.rest.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          <p className="text-xs text-muted">Esses campos ficam em branco para você preencher; nenhum valor é estimado por nós.</p>
        </Card>
      )}

      {drafts.map((d) => {
        const v = values[d.key];
        const match = comparePrinters(v.slicerPrinterName.trim() || null, chosen);
        const warn = printerMatchMessage(match, v.slicerPrinterName.trim(), chosen?.name);
        return (
          <Card key={d.key} className="space-y-4">
            {multiple && (
              <Checkbox label={`Importar “${d.name}”`} checked={selected.has(d.key)} onChange={(e) => setSelected((s) => { const n = new Set(s); if (e.target.checked) n.add(d.key); else n.delete(d.key); return n; })} />
            )}
            <ProfileFields values={v} onChange={(next) => setValues((all) => ({ ...all, [d.key]: next }))} tags={tagsFor(v, originals[d.key])} errors={errors[d.key]} />
            {warn && (
              <p role="alert" className="flex gap-2 rounded-xl bg-accent-soft px-3 py-2 text-sm text-warn">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {warn}
              </p>
            )}
            <Button onClick={() => save(d.key)} disabled={saving}>{saving ? "Salvando…" : "Calcular preço"}</Button>
          </Card>
        );
      })}

      <details className="rounded-2xl border border-line bg-surface p-4" data-testid="relatorio">
        <summary className="cursor-pointer text-sm font-medium">Detalhes técnicos da leitura</summary>
        <p className="mt-3 text-xs text-muted">
          O que o leitor reconheceu e a estrutura do arquivo (só nomes, nunca o conteúdo). Útil para conferir a leitura de um arquivo real: copie e cole numa conversa de suporte.
          Remova o nome do arquivo se ele for sensível.
        </p>
        <pre className="num mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-paper p-3 text-xs">{report}</pre>
        <div className="mt-3 flex items-center gap-3">
          <Button size="sm" variant="secondary" onClick={copyReport}>Copiar relatório de leitura</Button>
          {copied === "sim" && <span role="status" className="text-xs text-ok">Copiado.</span>}
          {copied === "falhou" && <span role="status" className="text-xs text-warn">Não foi possível copiar automaticamente; selecione o texto acima.</span>}
        </div>
      </details>

      <Card className="space-y-3">
        <Checkbox label="Guardar o arquivo original na minha conta" checked={storeFile} onChange={(e) => setStoreFile(e.target.checked)} />
        <p className="text-xs text-muted">Desmarcado por padrão: os dados e a miniatura já bastam para precificar. O arquivo guardado usa o espaço do seu plano.</p>
      </Card>

      <FormMessage error={error} />
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={() => save()} disabled={saving}>Salvar modelo sem calcular</Button>
        <Button variant="ghost" onClick={onCancel} disabled={saving}>Cancelar</Button>
      </div>
    </div>
  );
}
