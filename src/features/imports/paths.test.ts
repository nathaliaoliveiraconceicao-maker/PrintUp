import { describe, expect, it } from "vitest";
import { filePath, isValidFilePath, isValidThumbPath, safeFileName, thumbPath, uuid4 } from "./paths";

const U = "11111111-1111-4111-8111-111111111111";
const V = "22222222-2222-4222-8222-222222222222";
const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("safeFileName", () => {
  it("remove acentos, espaços e caracteres especiais", () => {
    expect(safeFileName("Suporte de Celular (v2).gcode.3mf")).toBe("Suporte_de_Celular_v2_.gcode.3mf");
    expect(safeFileName("../../etc/passwd")).toBe("etc_passwd");
    expect(safeFileName("")).toBe("arquivo");
    expect(safeFileName("a".repeat(300)).length).toBeLessThanOrEqual(80);
  });
});

describe("caminhos no bucket", () => {
  it("os caminhos gerados por nós são válidos para o próprio usuário", () => {
    expect(isValidFilePath(U, filePath(U, ID, "Peça nova.3mf"))).toBe(true);
    expect(isValidThumbPath(U, thumbPath(U, ID))).toBe(true);
  });
  it("não valem para outro usuário", () => {
    expect(isValidFilePath(V, filePath(U, ID, "a.3mf"))).toBe(false);
    expect(isValidThumbPath(V, thumbPath(U, ID))).toBe(false);
  });
  it("recusa travessia de diretório, barras extras e nomes soltos", () => {
    for (const p of [`${U}/../${V}/x`, `${U}/${ID}-../a`, `${U}/sub/${ID}-a.3mf`, `${U}/a.3mf`, `${U}/${ID}-a b.3mf`, `${U}\\${ID}-a.3mf`]) {
      expect(isValidFilePath(U, p), p).toBe(false);
    }
    expect(isValidThumbPath(U, `${U}/thumbs/../${ID}.png`)).toBe(false);
    expect(isValidThumbPath(U, `${U}/thumbs/${ID}.svg`)).toBe(false);
  });
});

describe("uuid4", () => {
  it("gera UUID v4 válido e único", () => {
    const a = uuid4();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(uuid4()).not.toBe(a);
    expect(isValidThumbPath(U, thumbPath(U, a))).toBe(true);
  });
});
