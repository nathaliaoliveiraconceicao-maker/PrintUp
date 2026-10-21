import { describe, expect, it } from "vitest";
import { applyProfileEdit, provenanceTag, resolveOrigin, storedTag, type StoredProfile } from "./provenance";
import { NO_ORIGINAL, minutesFromValues, toProfileInput, valuesFromDraft, valuesFromMinutes, emptyValues, originalFromDraft } from "./profile-values";

describe("resolveOrigin", () => {
  it("valor igual ao do arquivo mantém a origem 'arquivo'", () => {
    expect(resolveOrigin(25.5, "arquivo", 25.5)).toEqual({ origin: "arquivo", edited: false });
  });
  it("valor corrigido vira 'manual' e 'editado'", () => {
    expect(resolveOrigin(25.5, "arquivo", 30)).toEqual({ origin: "manual", edited: true });
  });
  it("valor digitado onde o arquivo não trouxe nada é 'manual', mas não 'editado'", () => {
    expect(resolveOrigin(null, null, 12)).toEqual({ origin: "manual", edited: false });
  });
  it("apagar o valor remove a origem (sem dado, sem origem)", () => {
    expect(resolveOrigin(25.5, "arquivo", null)).toEqual({ origin: null, edited: true });
    expect(resolveOrigin(null, null, null)).toEqual({ origin: null, edited: false });
  });
});

describe("provenanceTag", () => {
  it("rótulos exibidos ao lado dos campos", () => {
    expect(provenanceTag(25.5, 25.5)).toBe("do arquivo");
    expect(provenanceTag(25.5, 30)).toBe("editado");
    expect(provenanceTag(null, 30)).toBe("informado por você");
    expect(provenanceTag(25.5, null)).toBe("em branco");
    expect(provenanceTag(null, null)).toBe("em branco");
    expect(provenanceTag("PLA", "PETG")).toBe("editado");
    expect(provenanceTag(false, false)).toBe("do arquivo");
  });
  it("storedTag: etiqueta de dados já gravados", () => {
    expect(storedTag(true, "arquivo", false)).toBe("do arquivo");
    expect(storedTag(true, "manual", true)).toBe("editado");
    expect(storedTag(true, "manual", false)).toBe("informado por você");
    expect(storedTag(false, null, false)).toBe("em branco");
  });
});

describe("applyProfileEdit (servidor recalcula as origens)", () => {
  const stored: StoredProfile = {
    weight_g: 25.5, print_minutes: 150, weight_origin: "arquivo", time_origin: "arquivo", edited_fields: [], field_origins: { pieces: "arquivo", printer: "arquivo", material: "arquivo", support: "arquivo" },
    piece_count: 2, slicer_printer_name: "Bambu Lab A1 mini", filament_type: "PLA", support_used: false, waste_g: null,
  };
  const same = { weightG: 25.5, printMinutes: 150, pieceCount: 2, slicerPrinterName: "Bambu Lab A1 mini", filamentType: "PLA", supportUsed: false, wasteG: null };

  it("sem mudanças, nada é marcado como editado", () => {
    expect(applyProfileEdit(stored, same)).toMatchObject({ weight_origin: "arquivo", time_origin: "arquivo", edited_fields: [] });
  });
  it("corrigir o peso marca origem manual e o campo editado; o tempo continua do arquivo", () => {
    const r = applyProfileEdit(stored, { ...same, weightG: 30 });
    expect(r).toMatchObject({ weight_g: 30, weight_origin: "manual", time_origin: "arquivo", edited_fields: ["weight"] });
  });
  it("a lista de campos editados é cumulativa", () => {
    const first = applyProfileEdit(stored, { ...same, weightG: 30 });
    const second = applyProfileEdit({ ...stored, ...first, piece_count: 2, slicer_printer_name: "Bambu Lab A1 mini", filament_type: "PLA", support_used: false, waste_g: null }, { ...same, weightG: 30, slicerPrinterName: "Outra" });
    expect(second.edited_fields).toEqual(["printer", "weight"]);
  });
  it("campos secundários: corrigir o material marca 'manual' e 'material' como editado; peças seguem do arquivo", () => {
    const r = applyProfileEdit(stored, { ...same, filamentType: "PETG" });
    expect(r.field_origins).toMatchObject({ material: "manual", pieces: "arquivo", printer: "arquivo" });
    expect(r.edited_fields).toEqual(["material"]);
  });
  it("campo secundário preenchido pelo usuário onde o arquivo não trouxe nada fica 'manual' (e não 'editado')", () => {
    const r = applyProfileEdit(stored, { ...same, wasteG: 2 });
    expect(r.field_origins.waste).toBe("manual");
    expect(r.edited_fields).toEqual([]);
  });
  it("limpar um valor remove também a origem", () => {
    expect(applyProfileEdit(stored, { ...same, printMinutes: null })).toMatchObject({ print_minutes: null, time_origin: null });
  });
});

describe("campos digitados", () => {
  it("horas e minutos viram minutos totais; vazio vira null; inválido vira NaN", () => {
    expect(minutesFromValues({ hours: "2", minutes: "30" })).toBe(150);
    expect(minutesFromValues({ hours: "1,5", minutes: "" })).toBe(90);
    expect(minutesFromValues({ hours: "", minutes: "" })).toBeNull();
    expect(minutesFromValues({ hours: "0", minutes: "0" })).toBeNull();
    expect(minutesFromValues({ hours: "x", minutes: "" })).toBeNaN();
  });
  it("minutos totais voltam para horas e minutos", () => {
    expect(valuesFromMinutes(150)).toEqual({ hours: "2", minutes: "30" });
    expect(valuesFromMinutes(45.17)).toEqual({ hours: "", minutes: "45,17" });
    expect(valuesFromMinutes(null)).toEqual({ hours: "", minutes: "" });
  });
  it("rascunho do arquivo => campos => payload: dados intactos continuam 'arquivo'", () => {
    const draft = { key: "p1", name: "Corpo", plateIndex: 1, pieceCount: 2, materials: [], filamentType: "PLA", weightG: 25.5, printMinutes: 150, supportUsed: false, wasteG: null };
    const values = valuesFromDraft(draft, "Bambu Lab A1 mini");
    const r = toProfileInput(values, { plateIndex: 1, printerModelCode: "N2S", nozzleMm: 0.4, layerHeightMm: 0.2, materials: null, rawMeta: null }, originalFromDraft(draft, "Bambu Lab A1 mini"));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.input).toMatchObject({ weightG: 25.5, printMinutes: 150, weightOrigin: "arquivo", timeOrigin: "arquivo", editedFields: [], supportUsed: false, fieldOrigins: { pieces: "arquivo", printer: "arquivo", material: "arquivo", support: "arquivo" } });
  });
  it("corrigir um campo muda só a origem desse campo", () => {
    const draft = { key: "p1", name: "Corpo", plateIndex: 1, pieceCount: 2, materials: [], filamentType: "PLA", weightG: 25.5, printMinutes: 150, supportUsed: null, wasteG: null };
    const values = { ...valuesFromDraft(draft, null), weightG: "30" };
    const r = toProfileInput(values, { plateIndex: 1, printerModelCode: null, nozzleMm: null, layerHeightMm: null, materials: null, rawMeta: null }, originalFromDraft(draft, null));
    if (!r.ok) throw new Error("inválido");
    expect(r.input).toMatchObject({ weightG: 30, weightOrigin: "manual", timeOrigin: "arquivo", editedFields: ["weight"] });
  });
  it("entrada manual: tudo que o usuário digita é 'manual'; o que deixa vazio fica sem origem", () => {
    const r = toProfileInput({ ...emptyValues("Meu perfil"), weightG: "12,5" }, { plateIndex: null, printerModelCode: null, nozzleMm: null, layerHeightMm: null, materials: null, rawMeta: null }, NO_ORIGINAL);
    if (!r.ok) throw new Error("inválido");
    expect(r.input).toMatchObject({ weightG: 12.5, weightOrigin: "manual", printMinutes: null, timeOrigin: null, fieldOrigins: {} });
  });
  it("rejeita nome vazio, números inválidos e peso zero", () => {
    const meta = { plateIndex: null, printerModelCode: null, nozzleMm: null, layerHeightMm: null, materials: null, rawMeta: null };
    const r = toProfileInput({ ...emptyValues(""), weightG: "0", pieceCount: "1,5", minutes: "abc" }, meta, NO_ORIGINAL);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["minutes", "name", "pieceCount", "weightG"]);
  });
});
