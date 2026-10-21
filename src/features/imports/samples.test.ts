import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fromBytes } from "./bytes";
import { SYNTHETIC_NOTE, splitNotes } from "./notes";
import { parseModelFile } from "./parse-file";
import { buildReadingReport } from "./report";
import type { ParsedModel } from "./types";

/**
 * Testa os arquivos de exemplo PUBLICADOS em public/exemplos (os mesmos que a tela oferece para teste).
 * São SINTÉTICOS: montados pelo PrintUp, não exportações reais de nenhum programa.
 */
const DIR = path.join(process.cwd(), "public", "exemplos");
const load = (name: string) => new Uint8Array(readFileSync(path.join(DIR, name)));

async function ok(name: string): Promise<ParsedModel> {
  const r = await parseModelFile(name, fromBytes(load(name)));
  if (r.status !== "ok") throw new Error(`${name}: ${r.status === "rejected" ? r.message : ""}`);
  return r.model;
}

describe("exemplos publicados em public/exemplos", () => {
  it("existem (rode `npm run exemplos:gerar` se faltar algum)", () => {
    const files = readdirSync(DIR).sort();
    expect(files).toEqual(
      [
        "LEIA-ME.txt",
        "exemplo-sintetico-3mf-completo.3mf",
        "exemplo-sintetico-3mf-projeto-prusa.3mf",
        "exemplo-sintetico-3mf-sem-fatiamento.3mf",
        "exemplo-sintetico-gcode-bambu.gcode",
        "exemplo-sintetico-gcode-cura-sem-peso.gcode",
        "exemplo-sintetico-gcode-prusa.gcode",
        "exemplo-sintetico-gcode-so-tempo.gcode",
        "exemplo-sintetico-invalido-nao-e-3mf.3mf",
        "exemplo-sintetico-invalido-stl.stl",
      ].sort(),
    );
    expect(existsSync(path.join(DIR, "LEIA-ME.txt"))).toBe(true);
  });

  it("o LEIA-ME declara que os arquivos são sintéticos e NÃO reais", () => {
    const txt = readFileSync(path.join(DIR, "LEIA-ME.txt"), "utf8");
    expect(txt).toContain("SINTÉTICOS");
    expect(txt).toContain("NÃO são exportações reais");
  });

  describe("completos", () => {
    it("3MF completo: duas placas, miniatura PNG, peso, tempo, material e impressora", async () => {
      const m = await ok("exemplo-sintetico-3mf-completo.3mf");
      expect(m.synthetic).toBe(true);
      expect(m.title).toBe("[EXEMPLO SINTÉTICO] Suporte de celular");
      expect(m.printerName).toBe("Bambu Lab A1 mini");
      expect(m.plates.map((p) => [p.weightG, p.printMinutes])).toEqual([[25.5, 150], [6.5, 60]]);
      expect(m.thumbnail).not.toBeNull();
      expect(m.thumbnail!.length).toBeGreaterThan(100); // PNG de verdade, não só a assinatura
    });
    it("G-code estilo Prusa", async () => {
      const m = await ok("exemplo-sintetico-gcode-prusa.gcode");
      expect(m.synthetic).toBe(true);
      expect(m.plates[0]).toMatchObject({ weightG: 25.4, printMinutes: 150.25 });
      expect(m.printerName).toBe("MK3S");
    });
    it("G-code estilo Bambu", async () => {
      const m = await ok("exemplo-sintetico-gcode-bambu.gcode");
      expect(m.plates[0]).toMatchObject({ weightG: 15.1, printMinutes: 91.17 });
      expect(m.printerName).toBe("Bambu Lab A1 mini");
    });
  });

  describe("incompletos (nada é inventado)", () => {
    it("3MF sem fatiamento", async () => {
      const m = await ok("exemplo-sintetico-3mf-sem-fatiamento.3mf");
      expect(m.hasSliceData).toBe(false);
      expect(m.plates).toHaveLength(0);
      expect(m.notes.join(" ")).toContain("Fatie o modelo");
    });
    it("3MF projeto Prusa", async () => {
      const m = await ok("exemplo-sintetico-3mf-projeto-prusa.3mf");
      expect(m.hasSliceData).toBe(false);
      expect(m.printerName).toBe("MK3S");
    });
    it("G-code Cura: tempo sim, peso não", async () => {
      const m = await ok("exemplo-sintetico-gcode-cura-sem-peso.gcode");
      expect(m.plates[0].printMinutes).toBe(83.75);
      expect(m.plates[0].weightG).toBeNull();
    });
    it("G-code só com tempo", async () => {
      const m = await ok("exemplo-sintetico-gcode-so-tempo.gcode");
      expect(m.plates[0].printMinutes).toBe(45.17);
      expect(m.plates[0].weightG).toBeNull();
      expect(m.plates[0].materials).toEqual([]);
    });
  });

  describe("inválidos", () => {
    it("texto com extensão .3mf", async () => {
      const r = await parseModelFile("exemplo-sintetico-invalido-nao-e-3mf.3mf", fromBytes(load("exemplo-sintetico-invalido-nao-e-3mf.3mf")));
      expect(r).toMatchObject({ status: "rejected", code: "tipo_invalido" });
    });
    it("STL", async () => {
      const r = await parseModelFile("exemplo-sintetico-invalido-stl.stl", fromBytes(load("exemplo-sintetico-invalido-stl.stl")));
      expect(r).toMatchObject({ status: "rejected", code: "stl" });
    });
  });

  it("todos os exemplos válidos se identificam como SINTÉTICOS e o aviso vai junto dos dados", async () => {
    const valid = readdirSync(DIR).filter((f) => /^exemplo-sintetico-(3mf|gcode)-/.test(f));
    expect(valid.length).toBe(7);
    for (const f of valid) {
      const m = await ok(f);
      expect(m.synthetic, f).toBe(true);
      expect(m.notes, f).toContain(SYNTHETIC_NOTE);
    }
  });
});

describe("marcação de sintético", () => {
  it("um arquivo sem o marcador NÃO é tratado como sintético", async () => {
    const r = await parseModelFile("real.gcode", fromBytes(new TextEncoder().encode("; generated by PrusaSlicer 2.6.0\n; filament used [g] = 10\n")));
    expect(r.status === "ok" && r.model.synthetic).toBe(false);
    expect(r.status === "ok" && r.model.notes.includes(SYNTHETIC_NOTE)).toBe(false);
  });
  it("splitNotes separa o aviso de sintético dos demais", () => {
    expect(splitNotes([SYNTHETIC_NOTE, "Peso: não encontrado."])).toEqual({ synthetic: true, rest: ["Peso: não encontrado."] });
    expect(splitNotes(["Peso: não encontrado."])).toEqual({ synthetic: false, rest: ["Peso: não encontrado."] });
  });
});

describe("relatório de leitura (validação com arquivos reais)", () => {
  it("lista o que foi reconhecido, os avisos e a estrutura (só nomes)", async () => {
    const bytes = load("exemplo-sintetico-3mf-completo.3mf");
    const r = await parseModelFile("x.3mf", fromBytes(bytes));
    if (r.status !== "ok") throw new Error();
    const rep = buildReadingReport(r.model, { name: "x.3mf", size: bytes.length });
    expect(rep).toContain("Programa identificado: Bambu Studio 01.08.00.62");
    expect(rep).toContain("Arquivo sintético de exemplo: SIM");
    expect(rep).toContain("Placa 1 (índice 1): tempo 150 min · peso 25.5 g");
    expect(rep).toContain("Metadata/slice_info.config");
    expect(rep).toContain("Chaves reconhecidas:");
  });
  it("para G-code lista as chaves de comentário vistas e não vaza o conteúdo do arquivo", async () => {
    const secret = "SEGREDO-NO-MEIO-DO-ARQUIVO";
    const text = `; generated by PrusaSlicer 2.6.0\nG1 X1 Y1 ; ${secret}\n; filament used [g] = 10\n`;
    const r = await parseModelFile("a.gcode", fromBytes(new TextEncoder().encode(text)));
    if (r.status !== "ok") throw new Error();
    const rep = buildReadingReport(r.model, { name: "a.gcode", size: text.length });
    expect(rep).toContain("Chaves de comentário vistas");
    expect(rep).toContain("filament used [g]");
    expect(rep).not.toContain(secret);
  });
  it("no 3MF a estrutura traz só os nomes das entradas (não o conteúdo)", async () => {
    const r = await parseModelFile("x.3mf", fromBytes(load("exemplo-sintetico-3mf-completo.3mf")));
    if (r.status !== "ok") throw new Error();
    expect(r.model.structure).toContain("Metadata/slice_info.config");
    expect(r.model.structure.join("\n")).not.toContain("prediction");
  });
});
