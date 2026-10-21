import { describe, expect, it } from "vitest";
import { gettingStartedSteps } from "./steps";

describe("gettingStartedSteps", () => {
  it("conta nova: nada concluído e o primeiro passo é a impressora", () => {
    const r = gettingStartedSteps({ printers: 0, filaments: 0, hasSettings: false, pricings: 0 });
    expect(r).toMatchObject({ done: 0, total: 4 });
    expect(r.next?.key).toBe("impressora");
  });
  it("o próximo passo é sempre o primeiro que falta, mesmo fora de ordem", () => {
    const r = gettingStartedSteps({ printers: 1, filaments: 0, hasSettings: true, pricings: 0 });
    expect(r.done).toBe(2);
    expect(r.next?.key).toBe("filamento");
  });
  it("tudo feito: sem próximo passo", () => {
    const r = gettingStartedSteps({ printers: 2, filaments: 3, hasSettings: true, pricings: 5 });
    expect(r).toMatchObject({ done: 4, next: null });
  });
  it("cada passo aponta para uma tela existente", () => {
    const hrefs = gettingStartedSteps({ printers: 0, filaments: 0, hasSettings: false, pricings: 0 }).steps.map((s) => s.href);
    expect(hrefs).toEqual(["/impressoras/nova", "/filamentos/novo", "/configuracoes", "/calculadora"]);
  });
});
