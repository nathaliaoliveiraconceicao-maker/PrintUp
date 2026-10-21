import { describe, expect, it } from "vitest";
import { fromBytes } from "./bytes";
import { buildDrafts, defaultTitle, summarizeMaterials } from "./drafts";
import { parseModelFile } from "./parse-file";
import { bambuThreeMf, geometryOnlyThreeMf } from "./testing/fixtures";

async function model(name: string, bytes: Uint8Array) {
  const r = await parseModelFile(name, fromBytes(bytes));
  if (r.status !== "ok") throw new Error(r.message);
  return r.model;
}

describe("buildDrafts", () => {
  it("uma entrada por placa, com resumo de materiais", async () => {
    const drafts = buildDrafts(await model("a.3mf", bambuThreeMf()));
    expect(drafts).toHaveLength(2);
    expect(drafts[0]).toMatchObject({ name: "Corpo", weightG: 25.5, printMinutes: 150, filamentType: "PLA" });
    expect(drafts[1]).toMatchObject({ name: "Placa 2", weightG: 6.5, filamentType: "PLA + PETG" });
  });
  it("sem fatiamento: um perfil vazio, sem peso nem tempo inventados", async () => {
    const drafts = buildDrafts(await model("a.3mf", geometryOnlyThreeMf()));
    expect(drafts).toHaveLength(1);
    expect(drafts[0].weightG).toBeNull();
    expect(drafts[0].printMinutes).toBeNull();
  });
});

describe("defaultTitle", () => {
  it("usa o título do arquivo e, na falta, o nome do arquivo sem extensão", async () => {
    expect(defaultTitle(await model("a.3mf", bambuThreeMf()), "x.3mf")).toBe("Suporte de Celular");
    const bare = await model("a.3mf", geometryOnlyThreeMf());
    expect(defaultTitle({ ...bare, title: null }, "meu_modelo_legal.gcode.3mf")).toBe("meu modelo legal");
  });
  it("summarizeMaterials ignora vazios e repetidos", () => {
    expect(summarizeMaterials([{ type: "PLA", color: null, grams: 1 }, { type: "PLA", color: null, grams: 2 }, { type: null, color: null, grams: null }])).toBe("PLA");
    expect(summarizeMaterials([])).toBeNull();
  });
});
