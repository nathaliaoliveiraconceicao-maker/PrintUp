import { describe, expect, it } from "vitest";
import { parseDecimal } from "./utils";

describe("parseDecimal", () => {
  it("aceita vírgula e ponto de milhar", () => {
    expect(parseDecimal("12,5")).toBe(12.5);
    expect(parseDecimal("1.234,56")).toBe(1234.56);
    expect(parseDecimal("100")).toBe(100);
    expect(parseDecimal("0.9")).toBe(0.9);
  });
  it("retorna NaN para vazio ou lixo", () => {
    expect(parseDecimal("")).toBeNaN();
    expect(parseDecimal("abc")).toBeNaN();
    expect(parseDecimal(null)).toBeNaN();
    expect(parseDecimal("1,2,3")).toBeNaN();
  });
});
