import { describe, expect, it } from "vitest";
import { fromBytes, type ByteSource } from "./bytes";
import { MAX_FILE_BYTES } from "./limits";
import { parseModelFile } from "./parse-file";
import {
  BAMBU_SLICE_INFO,
  GCODE_BAMBU,
  GCODE_CURA,
  GCODE_NO_METADATA,
  GCODE_ONLY_TIME,
  GCODE_PRUSA,
  bambuThreeMf,
  geometryOnlyThreeMf,
  prusaProjectThreeMf,
} from "./testing/fixtures";
import { buildZip } from "./testing/zip-builder";

const enc = new TextEncoder();
const parseText = (name: string, text: string) => parseModelFile(name, fromBytes(enc.encode(text)));
const parseBytes = (name: string, bytes: Uint8Array) => parseModelFile(name, fromBytes(bytes));

async function ok(name: string, bytes: Uint8Array) {
  const r = await parseBytes(name, bytes);
  if (r.status !== "ok") throw new Error(`esperava ok, veio ${r.status}: ${r.message}`);
  return r.model;
}

describe("3MF no estilo Bambu/Orca (sintético) com metadados completos", () => {
  it("extrai nome, designer, impressora, material, peso, tempo, peças, placas e miniatura", async () => {
    const m = await ok("suporte.gcode.3mf", bambuThreeMf());
    expect(m.kind).toBe("3mf");
    expect(m.slicerFamily).toBe("bambu");
    expect(m.slicerLabel).toBe("Bambu Studio 01.08.00.62");
    expect(m.title).toBe("Suporte de Celular");
    expect(m.designer).toBe("Maria");
    expect(m.printerName).toBe("Bambu Lab A1 mini");
    expect(m.printerModelCode).toBe("N2S");
    expect(m.nozzleMm).toBe(0.4);
    expect(m.layerHeightMm).toBe(0.2);
    expect(m.plateCount).toBe(3); // 3 placas no projeto, 2 delas fatiadas
    expect(m.plates).toHaveLength(2);
    expect(m.hasSliceData).toBe(true);
    expect(m.thumbnail).not.toBeNull();

    const [p1, p2] = m.plates;
    expect(p1).toMatchObject({ index: 1, name: "Corpo", printMinutes: 150, weightG: 25.5, pieceCount: 2, supportUsed: false });
    expect(p1.materials).toEqual([{ type: "PLA", color: "#FFFFFF", grams: 25.5 }]);
    // Placa 2: sem `weight` no arquivo => soma dos filamentos informados (4.0 + 2.5); objeto "skipped" não conta como peça
    expect(p2).toMatchObject({ index: 2, printMinutes: 60, weightG: 6.5, pieceCount: 1, supportUsed: true });
    expect(p2.materials.map((x) => x.type)).toEqual(["PLA", "PETG"]);
  });

  it("não inventa o que o arquivo não traz (sem project_settings, sem miniatura, sem nome da placa)", async () => {
    const m = await ok("x.3mf", bambuThreeMf({ "Metadata/project_settings.config": null, "Metadata/plate_1.png": null }));
    expect(m.printerName).toBeNull(); // só havia o código N2S, que não traduzimos
    expect(m.printerModelCode).toBe("N2S");
    expect(m.layerHeightMm).toBeNull();
    expect(m.thumbnail).toBeNull();
    expect(m.notes.join(" ")).not.toContain("Peso do filamento: não encontrado");
  });

  it("miniatura que não é PNG é descartada", async () => {
    const m = await ok("x.3mf", bambuThreeMf({ "Metadata/plate_1.png": "isto não é uma imagem" }));
    expect(m.thumbnail).toBeNull();
  });

  it("valores sem sentido (peso/tempo zero ou texto) viram ausência", async () => {
    const info = BAMBU_SLICE_INFO.replace('value="9000"', 'value="0"').replace('value="25.5"/>\n    <metadata key="support_used"', 'value="abc"/>\n    <metadata key="support_used"');
    const m = await ok("x.3mf", bambuThreeMf({ "Metadata/slice_info.config": info }));
    // placa 1 sem tempo; peso cai para a soma do filamento (25.5) porque `weight` era inválido
    expect(m.plates[0].printMinutes).toBeNull();
    expect(m.plates[0].weightG).toBe(25.5);
  });

  it("sanitiza textos: controle removido, tamanho limitado e HTML tratado como texto", async () => {
    const evil = `<metadata name="Title">Nome\u0000com\u0007controle &lt;script&gt;alert(1)&lt;/script&gt; ${"x".repeat(500)}</metadata>`;
    const xml = `<model><metadata name="Application">BambuStudio-01.08.00.62</metadata>${evil}</model>`;
    const m = await ok("x.3mf", bambuThreeMf({ "3D/3dmodel.model": xml }));
    expect(m.title).not.toMatch(/[\u0000-\u001f]/);
    expect(m.title!.length).toBeLessThanOrEqual(160);
    expect(m.title).toContain("<script>alert(1)</script>"); // permanece texto; a interface escapa na exibição
  });

  it("JSON de projeto com __proto__ não contamina nada", async () => {
    const m = await ok("x.3mf", bambuThreeMf({ "Metadata/project_settings.config": '{"__proto__":{"polluted":"yes"},"printer_model":"Bambu Lab X1"}' }));
    expect(m.printerName).toBe("Bambu Lab X1");
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe("3MF sem informações de impressão", () => {
  it("geometria apenas: informa que é preciso fatiar e não devolve peso nem tempo", async () => {
    const m = await ok("cubo.3mf", geometryOnlyThreeMf());
    expect(m.hasSliceData).toBe(false);
    expect(m.plates).toHaveLength(0);
    expect(m.title).toBe("Cubo");
    expect(m.notes.join(" ")).toContain("não contém dados de fatiamento");
    expect(m.notes.join(" ")).toContain("Fatie o modelo");
  });

  it("projeto do PrusaSlicer: lê impressora e material, mas pede para fatiar", async () => {
    const m = await ok("engrenagem.3mf", prusaProjectThreeMf());
    expect(m.slicerFamily).toBe("prusa");
    expect(m.printerName).toBe("MK3S");
    expect(m.hasSliceData).toBe(false);
    expect(m.title).toBe("Engrenagem");
    expect(m.layerHeightMm).toBe(0.15);
    expect(m.notes[0]).toContain("PrusaSlicer sem fatiamento");
  });

  it("slice_info presente porém sem tempo nem peso => hasSliceData falso", async () => {
    const info = `<config><plate><metadata key="index" value="1"/><object name="A" skipped="false"/></plate></config>`;
    const m = await ok("x.3mf", bambuThreeMf({ "Metadata/slice_info.config": info }));
    expect(m.hasSliceData).toBe(false);
    expect(m.plates[0].printMinutes).toBeNull();
    expect(m.plates[0].weightG).toBeNull();
  });
});

describe("G-code (sintético) com dados compatíveis", () => {
  it("estilo PrusaSlicer", async () => {
    const r = await parseText("peca.gcode", GCODE_PRUSA);
    if (r.status !== "ok") throw new Error(r.message);
    const m = r.model;
    expect(m.slicerFamily).toBe("prusa");
    expect(m.slicerLabel).toBe("PrusaSlicer 2.6.0");
    expect(m.printerName).toBe("MK3S");
    expect(m.plates[0]).toMatchObject({ weightG: 25.4, printMinutes: 150.25, supportUsed: false, wasteG: 1.2 });
    expect(m.plates[0].materials).toEqual([{ type: "PLA", color: null, grams: 25.4 }]);
    expect(m.layerHeightMm).toBe(0.2);
    expect(m.nozzleMm).toBe(0.4);
  });

  it("estilo Bambu Studio: usa o tempo total estimado do cabeçalho", async () => {
    const r = await parseText("peca.gcode", GCODE_BAMBU);
    if (r.status !== "ok") throw new Error(r.message);
    const m = r.model;
    expect(m.slicerFamily).toBe("bambu");
    expect(m.printerName).toBe("Bambu Lab A1 mini");
    expect(m.plates[0].weightG).toBe(15.1);
    expect(m.plates[0].printMinutes).toBe(91.17); // 1h 31m 10s
    expect(m.plates[0].supportUsed).toBe(true);
    expect(m.rawMeta["total estimated time"]).toBe("1h 31m 10s");
  });

  it("estilo Cura: tempo em segundos; NÃO inventa o peso e avisa", async () => {
    const r = await parseText("peca.gcode", GCODE_CURA);
    if (r.status !== "ok") throw new Error(r.message);
    const m = r.model;
    expect(m.slicerFamily).toBe("cura");
    expect(m.plates[0].printMinutes).toBe(83.75);
    expect(m.plates[0].weightG).toBeNull();
    expect(m.printerName).toBe("Creality Ender-3");
    expect(m.notes.join(" ")).toContain("apenas o comprimento do filamento");
    expect(m.hasSliceData).toBe(true);
  });

  it("arquivos grandes: lê só começo e fim, nunca o arquivo inteiro", async () => {
    const filler = "G1 X10 Y10 E0.1\n".repeat(120_000); // ~1,9 MB de movimentos
    const text = `${GCODE_BAMBU.split("; CONFIG_BLOCK_START")[0]}${filler}; CONFIG_BLOCK_START\n; printer_model = Bambu Lab A1 mini\n; filament_type = PLA\n`;
    const bytes = enc.encode(text);
    let bytesRead = 0;
    const spy: ByteSource = {
      size: bytes.length,
      async read(a, b) {
        bytesRead += b - a;
        return bytes.slice(a, b);
      },
    };
    const r = await parseModelFile("grande.gcode", spy);
    if (r.status !== "ok") throw new Error(r.message);
    expect(r.model.printerName).toBe("Bambu Lab A1 mini"); // veio do FIM do arquivo
    expect(r.model.plates[0].weightG).toBe(15.1); // veio do COMEÇO
    expect(bytesRead).toBeLessThan(bytes.length / 2);
  });
});

describe("dados incompletos", () => {
  it("G-code só com tempo: peso fica vazio e é avisado", async () => {
    const r = await parseText("a.gcode", GCODE_ONLY_TIME);
    if (r.status !== "ok") throw new Error(r.message);
    expect(r.model.plates[0].printMinutes).toBe(45.17);
    expect(r.model.plates[0].weightG).toBeNull();
    expect(r.model.hasSliceData).toBe(true);
    expect(r.model.notes.join(" ")).toContain("Peso do filamento: não encontrado");
    expect(r.model.notes.join(" ")).toContain("Material: não encontrado");
  });

  it("G-code sem nenhum metadado: tudo vazio e orientação para fatiar/informar", async () => {
    const r = await parseText("a.gcode", GCODE_NO_METADATA);
    if (r.status !== "ok") throw new Error(r.message);
    expect(r.model.hasSliceData).toBe(false);
    expect(r.model.plates[0].weightG).toBeNull();
    expect(r.model.plates[0].printMinutes).toBeNull();
    expect(r.model.printerName).toBeNull();
    expect(r.model.notes.join(" ")).toContain("não contém dados de fatiamento");
  });
});

describe("arquivo inválido", () => {
  it("extensão não suportada", async () => {
    const r = await parseText("modelo.obj", "v 0 0 0");
    expect(r).toMatchObject({ status: "rejected", code: "extensao" });
  });

  it("STL é tratado à parte, com orientação", async () => {
    const r = await parseText("modelo.stl", "solid x");
    expect(r).toMatchObject({ status: "rejected", code: "stl" });
    if (r.status === "rejected") expect(r.message).toContain("não trazem dados de fatiamento");
  });

  it(".bgcode (binário) por extensão e por conteúdo", async () => {
    expect(await parseText("a.bgcode", "GCDE")).toMatchObject({ code: "bgcode" });
    expect(await parseBytes("a.gcode", Uint8Array.from([0x47, 0x43, 0x44, 0x45, 0, 1, 2]))).toMatchObject({ code: "bgcode" });
  });

  it("vazio", async () => {
    expect(await parseBytes("a.3mf", new Uint8Array(0))).toMatchObject({ status: "rejected", code: "vazio" });
  });

  it(".3mf que não é ZIP", async () => {
    expect(await parseText("a.3mf", "isto é texto puro")).toMatchObject({ status: "rejected", code: "tipo_invalido" });
  });

  it("ZIP sem estrutura de 3MF", async () => {
    const r = await parseBytes("a.3mf", buildZip([{ name: "leia-me.txt", data: "oi" }]));
    expect(r).toMatchObject({ status: "rejected", code: "zip_invalido" });
  });

  it("ZIP truncado (corrompido)", async () => {
    const bytes = bambuThreeMf();
    expect(await parseBytes("a.3mf", bytes.slice(0, bytes.length - 30))).toMatchObject({ status: "rejected" });
  });

  it(".gcode com conteúdo binário ou que não é G-code", async () => {
    expect(await parseBytes("a.gcode", Uint8Array.from([71, 49, 0, 0, 1, 2, 3]))).toMatchObject({ code: "binario" });
    expect(await parseText("a.gcode", "Olá, isto é uma carta e não G-code.")).toMatchObject({ code: "tipo_invalido" });
  });
});

describe("arquivo excessivamente grande", () => {
  it("é recusado pelo tamanho SEM ler nenhum byte", async () => {
    const src: ByteSource = {
      size: MAX_FILE_BYTES + 1,
      async read() {
        throw new Error("não deveria ler");
      },
    };
    expect(await parseModelFile("enorme.3mf", src)).toMatchObject({ status: "rejected", code: "grande_demais" });
    expect(await parseModelFile("enorme.gcode", src)).toMatchObject({ status: "rejected", code: "grande_demais" });
  });

  it("no limite exato ainda é aceito para análise", async () => {
    const src: ByteSource = { size: MAX_FILE_BYTES, async read() { return new Uint8Array(4); } };
    const r = await parseModelFile("limite.3mf", src);
    expect(r.status === "rejected" && r.code === "grande_demais").toBe(false);
  });
});

describe("segurança de ZIP/3MF", () => {
  it("ZIP bomb: entrada que expande além do limite é recusada, mesmo mentindo o tamanho", async () => {
    const bomb = new Uint8Array(64 * 1024 * 1024); // 64 MB de zeros => ~64 KB compactados
    const zip = buildZip([
      { name: "[Content_Types].xml", data: "<Types/>" },
      { name: "Metadata/slice_info.config", data: bomb, declaredUncompressed: 100 }, // cabeçalho mente
    ]);
    expect(zip.length).toBeLessThan(1024 * 1024);
    const t0 = Date.now();
    const r = await parseBytes("bomba.3mf", zip);
    expect(r).toMatchObject({ status: "rejected", code: "zip_inseguro" });
    expect(Date.now() - t0).toBeLessThan(5000);
  });

  it("geometria gigante em 3D/3dmodel.model é lida só no começo (não é erro nem é carregada)", async () => {
    const big = `<model><metadata name="Title">Grande</metadata><metadata name="Application">BambuStudio-01.08.00.62</metadata>${"<vertex x=\"1\" y=\"2\" z=\"3\"/>".repeat(400_000)}</model>`;
    const m = await ok("x.3mf", bambuThreeMf({ "3D/3dmodel.model": big }));
    expect(m.title).toBe("Grande");
  });

  it("recusa caminhos suspeitos (zip-slip)", async () => {
    for (const name of ["../evil.txt", "/etc/passwd", "a/../../b", "C:\\x", "dir\\arq"]) {
      const zip = buildZip([{ name: "[Content_Types].xml", data: "<Types/>" }, { name, data: "x" }]);
      expect(await parseBytes("a.3mf", zip), name).toMatchObject({ status: "rejected", code: "zip_inseguro" });
    }
  });

  it("recusa entradas criptografadas, duplicadas e ZIP64", async () => {
    expect(await parseBytes("a.3mf", buildZip([{ name: "[Content_Types].xml", data: "x", encrypted: true }]))).toMatchObject({ code: "zip_inseguro" });
    expect(await parseBytes("a.3mf", buildZip([{ name: "[Content_Types].xml", data: "x" }, { name: "[Content_Types].xml", data: "y" }]))).toMatchObject({ code: "zip_inseguro" });
    expect(await parseBytes("a.3mf", buildZip([{ name: "[Content_Types].xml", data: "x" }], { zip64Marker: true }))).toMatchObject({ code: "zip_inseguro" });
  });

  it("recusa ZIP com entradas demais", async () => {
    const entries = Array.from({ length: 5001 }, (_, i) => ({ name: `f${i}.txt`, data: "", method: 0 as const }));
    expect(await parseBytes("a.3mf", buildZip(entries))).toMatchObject({ code: "zip_inseguro" });
  });

  it("método de compressão desconhecido é recusado (e pelo motivo certo)", async () => {
    const zip = buildZip([{ name: "[Content_Types].xml", data: "<Types/>" }, { name: "Metadata/slice_info.config", data: "x" }]);
    // localiza o cabeçalho central da 2ª entrada e troca o método (offset 10) para 99
    const sig = [0x50, 0x4b, 0x01, 0x02];
    const heads: number[] = [];
    for (let i = 0; i < zip.length - 4; i++) if (sig.every((b, k) => zip[i + k] === b)) heads.push(i);
    expect(heads).toHaveLength(2);
    new DataView(zip.buffer).setUint16(heads[1] + 10, 99, true);
    const r = await parseBytes("a.3mf", zip);
    expect(r).toMatchObject({ status: "rejected", code: "zip_invalido" });
    if (r.status === "rejected") expect(r.message).toContain("Método de compressão");
  });

  it("nada é executado: conteúdo de script no arquivo é apenas texto ignorado", async () => {
    const m = await ok("x.3mf", bambuThreeMf({ "Metadata/run.sh": "rm -rf /", "Metadata/evil.js": "process.exit(1)" }));
    expect(m.title).toBe("Suporte de Celular");
  });

  it("fluxo deflate corrompido vira erro tratado, sem exceção vazando", async () => {
    const zip = buildZip([
      { name: "[Content_Types].xml", data: "<Types/>" },
      { name: "Metadata/slice_info.config", data: "x", rawCompressed: Uint8Array.from([0xff, 0xfe, 0x00, 0x12, 0x34, 0x56, 0x78]) },
    ]);
    const r = await parseBytes("a.3mf", zip);
    expect(r).toMatchObject({ status: "rejected", code: "zip_invalido" });
  });
});
