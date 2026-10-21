import { describe, expect, it } from "vitest";
import { profileInputSchema, saveImportSchema } from "./schema";

const profile = {
  name: "Placa 1", plateIndex: 1, pieceCount: 2, slicerPrinterName: "Bambu Lab A1 mini", printerModelCode: null, nozzleMm: 0.4, layerHeightMm: 0.2,
  filamentType: "PLA", materials: [{ type: "PLA", color: "#FFFFFF", grams: 25.5 }], weightG: 25.5, printMinutes: 150, supportUsed: false, wasteG: null,
  weightOrigin: "arquivo", timeOrigin: "arquivo", editedFields: [], fieldOrigins: { pieces: "arquivo", printer: "arquivo", material: "arquivo", support: "arquivo" }, rawMeta: { Application: "BambuStudio-01.08.00.62" },
};
const model = { source: "arquivo", title: "Suporte", designer: null, slicerLabel: "Bambu Studio 01.08", plateCount: 1, parseNotes: [], fileKind: null, fileName: null, filePath: null, fileSize: null, thumbPath: null, profiles: [profile] };

describe("saveImportSchema (o servidor não confia no navegador)", () => {
  it("aceita um modelo completo", () => {
    expect(saveImportSchema.safeParse(model).success).toBe(true);
  });
  it("peso sem origem ou origem sem peso é recusado (nunca inventar dados)", () => {
    expect(profileInputSchema.safeParse({ ...profile, weightOrigin: null }).success).toBe(false);
    expect(profileInputSchema.safeParse({ ...profile, weightG: null }).success).toBe(false);
    expect(profileInputSchema.safeParse({ ...profile, weightG: null, weightOrigin: null }).success).toBe(true);
  });
  it("campo secundário com valor exige origem, e sem valor não pode ter origem", () => {
    expect(profileInputSchema.safeParse({ ...profile, fieldOrigins: { printer: "arquivo", material: "arquivo", support: "arquivo" } }).success).toBe(false); // peças sem origem
    expect(profileInputSchema.safeParse({ ...profile, wasteG: null, fieldOrigins: { ...profile.fieldOrigins, waste: "manual" } }).success).toBe(false); // origem sem valor
  });
  it("recusa valores absurdos ou inválidos", () => {
    expect(profileInputSchema.safeParse({ ...profile, weightG: 0 }).success).toBe(false);
    expect(profileInputSchema.safeParse({ ...profile, weightG: -5 }).success).toBe(false);
    expect(profileInputSchema.safeParse({ ...profile, printMinutes: 10 ** 9 }).success).toBe(false);
    expect(profileInputSchema.safeParse({ ...profile, pieceCount: 1.5 }).success).toBe(false);
    expect(profileInputSchema.safeParse({ ...profile, materials: [{ type: "PLA", color: "vermelho", grams: 1 }] }).success).toBe(false);
  });
  it("exige ao menos um perfil e título", () => {
    expect(saveImportSchema.safeParse({ ...model, profiles: [] }).success).toBe(false);
    expect(saveImportSchema.safeParse({ ...model, title: "  " }).success).toBe(false);
  });
  it("arquivo e tipo andam juntos", () => {
    expect(saveImportSchema.safeParse({ ...model, filePath: "x" }).success).toBe(false);
    expect(saveImportSchema.safeParse({ ...model, fileKind: "3mf" }).success).toBe(false);
  });
  it("tipo de arquivo fora da lista (ex.: stl) é recusado", () => {
    expect(saveImportSchema.safeParse({ ...model, fileKind: "stl", filePath: "x" }).success).toBe(false);
  });
});
