"use client";

import { Field, Input, Select } from "@/components/ui/field";
import { Tag } from "./provenance-tag";
import type { ProvenanceTag } from "./provenance";
import type { ProfileValues } from "./profile-values";

export type TagField = "weight" | "time" | "pieces" | "printer" | "material" | "support" | "waste";
export type FieldTags = Partial<Record<TagField, ProvenanceTag>>;

/** Campos de um perfil de impressão. Os rótulos de origem vêm de quem usa (arquivo lido, ou dados já gravados). */
export function ProfileFields({
  values,
  onChange,
  tags = {},
  errors = {},
}: {
  values: ProfileValues;
  onChange: (next: ProfileValues) => void;
  tags?: FieldTags;
  errors?: Partial<Record<keyof ProfileValues, string>>;
}) {
  const set = <K extends keyof ProfileValues>(key: K, value: ProfileValues[K]) => onChange({ ...values, [key]: value });
  const tag = (f: TagField) => (tags[f] ? <Tag value={tags[f]!} /> : undefined);

  return (
    <div className="space-y-4">
      <Field label="Nome do perfil" error={errors.name}>
        <Input value={values.name} onChange={(e) => set("name", e.target.value)} maxLength={120} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Impressora do fatiamento" tag={tag("printer")} hint="Para qual impressora este tempo foi estimado. Deixe em branco se não souber.">
          <Input
            value={values.slicerPrinterName}
            onChange={(e) => set("slicerPrinterName", e.target.value)}
            maxLength={120}
            aria-description={tags.printer}
          />
        </Field>
        <Field label="Material" tag={tag("material")} hint="Ex.: PLA, PETG, PLA + PETG">
          <Input value={values.filamentType} onChange={(e) => set("filamentType", e.target.value)} maxLength={80} aria-description={tags.material} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Field label="Peso (g)" tag={tag("weight")} error={errors.weightG}>
          <Input inputMode="decimal" value={values.weightG} onChange={(e) => set("weightG", e.target.value)} placeholder="não informado" aria-description={tags.weight} />
        </Field>
        <Field label="Tempo (horas)" tag={tag("time")}>
          <Input inputMode="decimal" value={values.hours} onChange={(e) => set("hours", e.target.value)} placeholder="0" aria-description={tags.time} />
        </Field>
        <Field label="Tempo (minutos)" error={errors.minutes}>
          <Input inputMode="decimal" value={values.minutes} onChange={(e) => set("minutes", e.target.value)} placeholder="0" />
        </Field>
      </div>

      <details className="rounded-xl border border-line px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium">Mais dados do arquivo</summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="Peças na placa" tag={tag("pieces")} error={errors.pieceCount}>
            <Input inputMode="numeric" value={values.pieceCount} onChange={(e) => set("pieceCount", e.target.value)} placeholder="não informado" aria-description={tags.pieces} />
          </Field>
          <Field label="Suportes" tag={tag("support")}>
            <Select value={values.support} onChange={(e) => set("support", e.target.value as ProfileValues["support"])} aria-description={tags.support}>
              <option value="">Não informado</option>
              <option value="sim">Sim</option>
              <option value="nao">Não</option>
            </Select>
          </Field>
          <Field label="Desperdício (g)" tag={tag("waste")} error={errors.wasteG} hint="Purga/torre de limpeza, se o arquivo informar.">
            <Input inputMode="decimal" value={values.wasteG} onChange={(e) => set("wasteG", e.target.value)} placeholder="não informado" aria-description={tags.waste} />
          </Field>
        </div>
      </details>
    </div>
  );
}
