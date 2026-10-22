"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { parseDecimal } from "@/lib/utils";
import { saveImport } from "./actions";
import { emptyValues, minutesFromValues, NO_ORIGINAL, toProfileInput, type ProfileValues } from "./profile-values";
import { ProfileFields } from "./profile-fields";
import { provenanceTag } from "./provenance";
import { referenceUrl } from "./schema";

/**
 * Modelo de um link (qualquer site). O PrintUp NÃO lê a página: guarda o endereço como referência e o que você digitar
 * fica registrado como "informado por você".
 */
export function LinkImportForm({ printers }: { printers: { id: string; name: string }[] }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [designer, setDesigner] = useState("");
  const [values, setValues] = useState<ProfileValues>(emptyValues("Perfil 1"));
  const [errors, setErrors] = useState<Partial<Record<keyof ProfileValues, string>>>({});
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const printerId = printers[0]?.id;

  const w = values.weightG.trim() === "" ? null : parseDecimal(values.weightG);
  const t = minutesFromValues(values);
  const tags = { weight: provenanceTag(null, w === null || Number.isNaN(w) ? null : w), time: provenanceTag(null, t === null || Number.isNaN(t) ? null : t) };

  async function save(calc: boolean) {
    setError(undefined);
    const link = referenceUrl.safeParse(url);
    if (!link.success) return setError(link.error.issues[0]?.message ?? "Informe o link do modelo.");
    if (!title.trim()) return setError("Dê um nome ao produto.");
    const r = toProfileInput(values, { plateIndex: null, printerModelCode: null, nozzleMm: null, layerHeightMm: null, materials: null, rawMeta: null }, NO_ORIGINAL);
    if (!r.ok) {
      setErrors(r.errors);
      return setError("Revise os campos destacados.");
    }
    setErrors({});
    setSaving(true);
    const res = await saveImport({
      source: "link", sourceUrl: link.data, title, designer: designer.trim() || null, slicerLabel: null, plateCount: null, parseNotes: [],
      fileKind: null, fileName: null, filePath: null, fileSize: null, thumbPath: null, profiles: [r.input],
    });
    if (!res.ok || !res.modelId) {
      setSaving(false);
      return setError(res.error ?? "Não foi possível salvar.");
    }
    const pid = res.profileIds?.[0];
    router.push(calc && pid ? `/calculadora?perfil=${pid}${printerId ? `&impressora=${printerId}` : ""}` : `/importar/${res.modelId}`);
  }

  return (
    <div className="space-y-6">
      <Card className="space-y-4">
        <Field label="Link do modelo" hint="Endereço da página do modelo, de qualquer site. Guardamos só o link.">
          <Input type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" maxLength={500} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome do produto"><Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} placeholder="Ex.: Suporte de celular" /></Field>
          <Field label="Criador do modelo (opcional)"><Input value={designer} onChange={(e) => setDesigner(e.target.value)} maxLength={120} /></Field>
        </div>
        <p className="rounded-xl bg-paper px-3 py-2 text-sm text-muted">O PrintUp não lê dados da página. Informe abaixo o peso e o tempo que o seu fatiador mostrou para este modelo (ou deixe em branco).</p>
        <ProfileFields values={values} onChange={setValues} tags={tags} errors={errors} />
      </Card>
      <FormMessage error={error} />
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => save(true)} disabled={saving}>{saving ? "Salvando…" : "Calcular preço"}</Button>
        <Button variant="secondary" onClick={() => save(false)} disabled={saving}>Salvar sem calcular</Button>
        <Button asChild variant="ghost"><Link href="/importar">Cancelar</Link></Button>
      </div>
    </div>
  );
}
