import { describe, expect, it } from "vitest";
import { addDays, canTransition, effectiveStatus, formatDateBR, formatQuoteNumber, nextStatuses, todayBR } from "./status";

describe("status do orçamento", () => {
  it("transições válidas e inválidas (espelham o banco)", () => {
    expect(canTransition("rascunho", "enviado")).toBe(true);
    expect(canTransition("enviado", "aprovado")).toBe(true);
    expect(canTransition("enviado", "rascunho")).toBe(true);
    expect(canTransition("aprovado", "rascunho")).toBe(false);
    expect(canTransition("aprovado", "recusado")).toBe(false);
    expect(canTransition("recusado", "rascunho")).toBe(true);
    expect(canTransition("rascunho", "rascunho")).toBe(false);
    expect(nextStatuses("aprovado")).toEqual([]);
  });

  it("expirado é derivado da validade, só para rascunho e enviado", () => {
    expect(effectiveStatus("enviado", "2026-01-10", "2026-01-11")).toBe("expirado");
    expect(effectiveStatus("rascunho", "2026-01-10", "2026-01-11")).toBe("expirado");
    expect(effectiveStatus("enviado", "2026-01-10", "2026-01-10")).toBe("enviado"); // vale até o fim do dia
    expect(effectiveStatus("aprovado", "2026-01-10", "2026-02-01")).toBe("aprovado");
    expect(effectiveStatus("recusado", "2026-01-10", "2026-02-01")).toBe("recusado");
  });

  it("datas", () => {
    expect(addDays("2026-01-28", 7)).toBe("2026-02-04");
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(formatDateBR("2026-03-05")).toBe("05/03/2026");
    expect(formatQuoteNumber(7)).toBe("#0007");
    expect(todayBR(new Date("2026-01-01T02:00:00Z"))).toBe("2025-12-31"); // ainda é 31/12 em Brasília
  });
});
