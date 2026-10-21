"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormMessage } from "@/components/ui/form-message";
import { parseDecimal } from "@/lib/utils";
import { deleteProfile, updateProfile } from "./actions";
import { comparePrinters, printerMatchMessage } from "./printer-match";
import { minutesFromValues, valuesFromMinutes, type ProfileValues } from "./profile-values";
import { ProfileFields, type FieldTags } from "./profile-fields";
import { storedTag, type FieldOrigins, type Origin } from "./provenance";

export interface StoredProfileView {
  id: string;
  name: string;
  piece_count: number | null;
  slicer_printer_name: string | null;
  filament_type: string | null;
  weight_g: number | null;
  print_minutes: number | null;
  support_used: boolean | null;
  waste_g: number | null;
  weight_origin: Origin;
  time_origin: Origin;
  edited_fields: string[];
  field_origins: FieldOrigins | null;
}

const fmt = (n: number | null) => (n === null ? "" : String(n).replace(".", ","));

function toValues(p: StoredProfileView): ProfileValues {
  return {
    name: p.name,
    pieceCount: p.piece_count === null ? "" : String(p.piece_count),
    slicerPrinterName: p.slicer_printer_name ?? "",
    filamentType: p.filament_type ?? "",
    weightG: fmt(p.weight_g),
    ...valuesFromMinutes(p.print_minutes),
    support: p.support_used === null ? "" : p.support_used ? "sim" : "nao",
    wasteG: fmt(p.waste_g),
  };
}

const opt = (s: string): number | null => (s.trim() === "" ? null : parseDecimal(s));

/** Perfil já salvo: edita os campos e mostra a origem gravada de cada dado. Quem recalcula as origens é o servidor. */
export function ProfileEditor({
  profile,
  modelId,
  canDelete,
  printer,
}: {
  profile: StoredProfileView;
  modelId: string;
  canDelete: boolean;
  printer: { name: string; brand: string | null; model: string | null } | null;
}) {
  const router = useRouter();
  const [values, setValues] = useState(() => toValues(profile));
  const [state, setState] = useState<{ error?: string; ok?: string }>({});
  const [pending, start] = useTransition();
  const baseline = toValues(profile);
  const dirty = JSON.stringify(values) !== JSON.stringify(baseline);

  const tag = (present: boolean, origin: Origin | undefined, key: string, changed: boolean) =>
    changed ? ("editado" as const) : storedTag(present, origin, profile.edited_fields.includes(key));
  const o = profile.field_origins ?? {};
  const tags: FieldTags = {
    weight: tag(profile.weight_g !== null, profile.weight_origin, "weight", values.weightG !== baseline.weightG),
    time: tag(profile.print_minutes !== null, profile.time_origin, "time", values.hours !== baseline.hours || values.minutes !== baseline.minutes),
    pieces: tag(profile.piece_count !== null, o.pieces, "pieces", values.pieceCount !== baseline.pieceCount),
    printer: tag(profile.slicer_printer_name !== null, o.printer, "printer", values.slicerPrinterName !== baseline.slicerPrinterName),
    material: tag(profile.filament_type !== null, o.material, "material", values.filamentType !== baseline.filamentType),
    support: tag(profile.support_used !== null, o.support, "support", values.support !== baseline.support),
    waste: tag(profile.waste_g !== null, o.waste, "waste", values.wasteG !== baseline.wasteG),
  };

  const match = comparePrinters(values.slicerPrinterName.trim() || null, printer);
  const warn = printerMatchMessage(match, values.slicerPrinterName.trim(), printer?.name);

  function save() {
    const weight = opt(values.weightG);
    const waste = opt(values.wasteG);
    const pieces = opt(values.pieceCount);
    const minutes = minutesFromValues(values);
    if ([weight, waste, pieces, minutes].some((n) => n !== null && Number.isNaN(n)) || (weight !== null && weight <= 0) || (pieces !== null && (!Number.isInteger(pieces) || pieces < 1))) {
      return setState({ error: "Revise os números informados." });
    }
    start(async () => {
      const res = await updateProfile(profile.id, {
        name: values.name,
        pieceCount: pieces,
        slicerPrinterName: values.slicerPrinterName.trim() || null,
        filamentType: values.filamentType.trim() || null,
        weightG: weight,
        printMinutes: minutes,
        supportUsed: values.support === "" ? null : values.support === "sim",
        wasteG: waste,
      });
      if (res.ok) {
        setState({ ok: "Perfil salvo." });
        router.refresh();
      } else setState({ error: res.error });
    });
  }

  return (
    <Card className="space-y-4" data-testid="perfil">
      <ProfileFields values={values} onChange={(v) => { setValues(v); setState({}); }} tags={tags} />
      {warn && (
        <p role="alert" className="flex gap-2 rounded-xl bg-accent-soft px-3 py-2 text-sm text-warn">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {warn}
        </p>
      )}
      <FormMessage error={state.error} ok={state.ok} />
      <div className="flex flex-wrap gap-3">
        <Button asChild><Link href={`/calculadora?perfil=${profile.id}`}>Calcular preço</Link></Button>
        <Button variant="secondary" onClick={save} disabled={pending || !dirty}>{pending ? "Salvando…" : "Salvar alterações"}</Button>
        {canDelete && (
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => {
              if (confirm(`Excluir o perfil "${profile.name}"?`)) start(async () => {
                const res = await deleteProfile(profile.id, modelId);
                if (res.ok) router.refresh();
                else setState({ error: res.error });
              });
            }}
          >
            Excluir perfil
          </Button>
        )}
      </div>
      {dirty && <p className="text-xs text-muted">Há alterações não salvas. O botão “Calcular preço” usa os dados já salvos.</p>}
    </Card>
  );
}
