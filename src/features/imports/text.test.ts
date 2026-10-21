import { describe, expect, it } from "vitest";
import { cleanText, decodeXmlEntities, parseCommentConfig, parseDurationToMinutes, parseNumber, splitList, xmlBlocks, xmlKeyValueMetadata, xmlNamedMetadata, xmlTags } from "./text";

describe("parseDurationToMinutes", () => {
  it("converte unidades combinadas", () => {
    expect(parseDurationToMinutes("1h 20m 5s")).toBe(80.08);
    expect(parseDurationToMinutes("2d 3h")).toBe(3060);
    expect(parseDurationToMinutes("45m")).toBe(45);
    expect(parseDurationToMinutes("30s")).toBe(0.5);
  });
  it("sem unidade, vazio ou zero => null (nunca 0 inventado)", () => {
    expect(parseDurationToMinutes("")).toBeNull();
    expect(parseDurationToMinutes("abc")).toBeNull();
    expect(parseDurationToMinutes("0m 0s")).toBeNull();
    expect(parseDurationToMinutes("123")).toBeNull();
  });
});

describe("parseNumber", () => {
  it("aceita só números decimais simples", () => {
    expect(parseNumber("12.5")).toBe(12.5);
    expect(parseNumber(" 7 ")).toBe(7);
    expect(parseNumber("1e3")).toBeNull();
    expect(parseNumber("0x10")).toBeNull();
    expect(parseNumber("12,5")).toBeNull();
    expect(parseNumber("")).toBeNull();
    expect(parseNumber(undefined)).toBeNull();
    expect(parseNumber("Infinity")).toBeNull();
  });
});

describe("cleanText", () => {
  it("remove controles, normaliza espaços e limita", () => {
    expect(cleanText("  a\u0000b\tc\n d  ")).toBe("a b c d");
    expect(cleanText("x".repeat(300), 50)!.length).toBe(50);
    expect(cleanText("   ")).toBeNull();
    expect(cleanText(42 as unknown)).toBeNull();
  });
});

describe("XML simples", () => {
  const xml = `<config><plate><metadata key="a" value="1"/><metadata key="b" value="x &amp; y"/></plate><plate><metadata key="a" value="2"/></plate><object name='Peça' skipped="false"/><objects/></config>`;
  it("lê blocos e atributos, decodifica entidades e não confunde <objects> com <object>", () => {
    expect(xmlBlocks(xml, "plate")).toHaveLength(2);
    expect(xmlKeyValueMetadata(xmlBlocks(xml, "plate")[0])).toEqual({ a: "1", b: "x & y" });
    expect(xmlTags(xml, "object")).toEqual([{ name: "Peça", skipped: "false" }]);
  });
  it("metadados nomeados com conteúdo", () => {
    expect(xmlNamedMetadata(`<metadata name="Title">Olá &amp; tchau</metadata>`)).toEqual({ Title: "Olá & tchau" });
  });
  it("não resolve entidades externas (DTD/XXE é ignorado como texto)", () => {
    const evil = `<?xml version="1.0"?><!DOCTYPE x [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><model><metadata name="Title">&xxe;</metadata></model>`;
    expect(xmlNamedMetadata(evil).Title).toBe("&xxe;");
  });
  it("decodeXmlEntities limita códigos numéricos inválidos", () => {
    expect(decodeXmlEntities("&#99999999999;")).toBe("");
    expect(decodeXmlEntities("&lt;b&gt;")).toBe("<b>");
  });
});

describe("parseCommentConfig / splitList", () => {
  it("lê chaves com = ou :, só de linhas de comentário", () => {
    const m = parseCommentConfig("; a = 1\n;b: 2\nG1 X1 ; c = 3\n; sem separador\n");
    expect(m.get("a")).toBe("1");
    expect(m.get("b")).toBe("2");
    expect(m.has("c")).toBe(false); // comentário no fim de linha de comando não conta
  });
  it("splitList entende ; , e aspas", () => {
    expect(splitList('"#fff";"#000"')).toEqual(["#fff", "#000"]);
    expect(splitList("0.4,0.6")).toEqual(["0.4", "0.6"]);
  });
});
