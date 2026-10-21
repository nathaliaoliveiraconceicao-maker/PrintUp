"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { saveImport } from "./actions";
import { emptyValues, NO_ORIGINAL, toProfileInput, type ProfileValues } from "./profile-values";
import { ProfileFields } from "./profile-fields";
import { minutesFromValues } from "./profile-values";
import { provenanceTag } from "./provenance";
import { parseDecimal } from "@/lib/utils";

/** Entrada manual: nada vem de arquivo, então tudo o que for digitado fica registrado como "informado por você". */
export function ManualImportForm({ printers }: { printers: { id: string; name: string }[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [values, setValues] = useState<ProfileValues>(emptyValues("Perfil 1"));
  const [errors, setErrors] = useState<Partial<Record<keyof ProfileValues, string>>>({});
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const printerId = printers[0]?.id;

  const w = values.weightG.trim() === "" ? null : parseDecimal(values.weightG);
  const t = minutesFromValues(values);
  const tags = {
    weight: provenanceTag(null, w === null || Number.isNaN(w) ? null : w),
    time: provenanceTag(null, t === null || Number.isNaN(t) ? null : t),
  };

  async function save(calc: boolean) {
    setError(undefined);
    if (!title.trim()) return setError("Dê um nome ao produto.");
    const r = toProfileInput(values, { plateIndex: null, printerModelCode: null, nozzleMm: null, layerHeightMm: null, materials: null, rawMeta: null }, NO_ORIGINAL);
    if (!r.ok) {
      setErrors(r.errors);
      return setError("Revise os campos destacados.");
    }
    setErrors({});
    setSaving(true);
    const res = await saveImport({
      source: "manual", title, designer: null, slicerLabel: null, plateCount: null, parseNotes: [],
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
        <Field label="Nome do produto">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} placeholder="Ex.: Suporte de celular" />
        </Field>
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
