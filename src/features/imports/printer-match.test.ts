import { describe, expect, it } from "vitest";
import { comparePrinters, nameTokens, printerMatchMessage } from "./printer-match";

const a1mini = { name: "Bambu A1 mini", brand: "Bambu Lab", model: "A1 mini" };

describe("comparePrinters (impressora do arquivo × impressora escolhida)", () => {
  it("igual: ignora maiúsculas, acentos, ordem e a palavra 'Lab'", () => {
    expect(comparePrinters("Bambu Lab A1 mini", a1mini)).toBe("igual");
    expect(comparePrinters("BAMBU LAB A1 MINI", { name: "bambu a1 mini" })).toBe("igual");
    expect(comparePrinters("mini A1 Bambu", { name: "Bambu A1 mini" })).toBe("igual");
  });

  it("igual pela marca + modelo cadastrados, mesmo com um apelido no nome", () => {
    expect(comparePrinters("Bambu Lab A1 mini", { name: "Minha primeira", brand: "Bambu Lab", model: "A1 mini" })).toBe("igual");
  });

  it("diferente: outra impressora", () => {
    expect(comparePrinters("Creality Ender-3", a1mini)).toBe("diferente");
    expect(comparePrinters("MK3S", a1mini)).toBe("diferente");
  });

  it("diferente: variações do mesmo fabricante NÃO são tratadas como iguais (A1 ≠ A1 mini)", () => {
    expect(comparePrinters("Bambu Lab A1", a1mini)).toBe("diferente");
    expect(comparePrinters("Bambu Lab A1 mini", { name: "Bambu Lab A1" })).toBe("diferente");
  });

  it("na dúvida (apelido sem marca/modelo) avisa: falso alerta é melhor que alerta faltando", () => {
    expect(comparePrinters("Bambu Lab A1 mini", { name: "Impressora da sala" })).toBe("diferente");
  });

  it("desconhecida: o arquivo não informa a impressora, ou nenhuma foi escolhida", () => {
    expect(comparePrinters(null, a1mini)).toBe("desconhecida");
    expect(comparePrinters("   ", a1mini)).toBe("desconhecida");
    expect(comparePrinters("Bambu Lab A1 mini", null)).toBe("desconhecida");
  });
});

describe("printerMatchMessage", () => {
  it("só gera aviso quando as impressoras são diferentes", () => {
    expect(printerMatchMessage("diferente", "Creality Ender-3", "Bambu A1 mini")).toContain("Creality Ender-3");
    expect(printerMatchMessage("diferente", "Creality Ender-3", "Bambu A1 mini")).toContain("Bambu A1 mini");
    expect(printerMatchMessage("igual", "x", "y")).toBeNull();
    expect(printerMatchMessage("desconhecida", null, "y")).toBeNull();
  });
});

describe("nameTokens", () => {
  it("normaliza", () => {
    expect(nameTokens("Impressora Elegoo Neptune 4 Pro")).toEqual(["4", "elegoo", "neptune", "pro"]);
  });
});
