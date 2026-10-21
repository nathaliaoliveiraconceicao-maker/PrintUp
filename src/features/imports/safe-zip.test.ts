import { describe, expect, it } from "vitest";
import { fromBytes } from "./bytes";
import { ZIP_LIMITS } from "./limits";
import { ZipError, ZipReader, listZip, readEntry } from "./safe-zip";
import { buildZip } from "./testing/zip-builder";

describe("ZipReader", () => {
  it("lê entradas armazenadas e compactadas", async () => {
    const zip = buildZip([
      { name: "a.txt", data: "olá", method: 0 },
      { name: "b.txt", data: "mundo", method: 8 },
    ]);
    const r = await ZipReader.open(fromBytes(zip));
    expect(await r.readText("a.txt", { maxBytes: 100 })).toBe("olá");
    expect(await r.readText("b.txt", { maxBytes: 100 })).toBe("mundo");
    expect(await r.readText("inexistente", { maxBytes: 100 })).toBeNull();
  });

  it("limite por entrada: estoura => erro; truncate => devolve só o começo", async () => {
    const zip = buildZip([{ name: "grande.txt", data: "x".repeat(10_000) }]);
    const src = fromBytes(zip);
    const [entry] = await listZip(src);
    await expect(readEntry(src, entry, { maxBytes: 1000 })).rejects.toBeInstanceOf(ZipError);
    const head = await readEntry(src, entry, { maxBytes: 1000, truncate: true });
    expect(head.length).toBe(1000);
  });

  it("orçamento total: leituras sucessivas que somam além do limite são recusadas", async () => {
    const chunk = "a".repeat(1_900_000);
    const zip = buildZip([{ name: "cfg.txt", data: chunk }]);
    const r = await ZipReader.open(fromBytes(zip));
    const reads = Math.floor(ZIP_LIMITS.maxTotalBytes / 1_900_000); // cabem 8 leituras
    for (let i = 0; i < reads; i++) await r.read("cfg.txt", { maxBytes: 2_000_000 });
    await expect(r.read("cfg.txt", { maxBytes: 2_000_000 })).rejects.toMatchObject({ code: "inseguro" });
  });

  it("ZIP de 64 MB de zeros compacta pequeno e a leitura é interrompida no limite", async () => {
    const zip = buildZip([{ name: "z.bin", data: new Uint8Array(64 * 1024 * 1024), declaredUncompressed: 10 }]);
    expect(zip.length).toBeLessThan(200_000);
    const src = fromBytes(zip);
    const [entry] = await listZip(src);
    await expect(readEntry(src, entry, { maxBytes: 1_000_000 })).rejects.toMatchObject({ code: "inseguro" });
  });

  it("diretório central fora dos limites do arquivo", async () => {
    const zip = buildZip([{ name: "a.txt", data: "x" }]);
    // corrompe o deslocamento do diretório central no EOCD (offset 16 do EOCD)
    new DataView(zip.buffer).setUint32(zip.length - 22 + 16, zip.length + 100, true);
    await expect(listZip(fromBytes(zip))).rejects.toMatchObject({ code: "invalido" });
  });

  it("arquivo pequeno demais para ser ZIP", async () => {
    await expect(listZip(fromBytes(new Uint8Array(10)))).rejects.toMatchObject({ code: "invalido" });
  });
});
