import { describe, expect, it } from "vitest";
import { isOverCommitted, isSpoolLow, stockByFilament, type FilamentLike, type SpoolLike } from "./summary";

const f: FilamentLike = { id: "f1", name: "PLA Preto", material: "PLA", color: "Preto", min_stock_g: 300 };
const s = (over: Partial<SpoolLike> = {}): SpoolLike => ({ id: "s", filament_id: "f1", material: "PLA", color: "Preto", initial_g: 1000, remaining_g: 1000, reserved_g: 0, status: "nova", ...over });

describe("stockByFilament", () => {
  it("soma várias bobinas do mesmo material e cor", () => {
    const [r] = stockByFilament([f], [s({ remaining_g: 600, reserved_g: 100 }), s({ id: "s2", remaining_g: 500 })]);
    expect(r.spools).toBe(2);
    expect(r.remaining).toBe(1100);
    expect(r.reserved).toBe(100);
    expect(r.available).toBe(1000);
    expect(r.low).toBe(false);
  });
  it("alerta de estoque baixo olha o DISPONÍVEL (descontando reservas)", () => {
    expect(stockByFilament([f], [s({ remaining_g: 800, reserved_g: 600 })])[0].low).toBe(true);
    expect(stockByFilament([f], [s({ remaining_g: 800, reserved_g: 100 })])[0].low).toBe(false);
  });
  it("sem bobina utilizável: vazio e baixo; bobinas vazias/descartadas não contam", () => {
    const r = stockByFilament([f], [s({ status: "vazia", remaining_g: 0 }), s({ id: "x", status: "descartada" })])[0];
    expect(r.empty).toBe(true);
    expect(r.low).toBe(true);
    expect(r.spools).toBe(0);
  });
  it("bobina quase no fim e reserva acima do saldo", () => {
    expect(isSpoolLow(s({ remaining_g: 120 }))).toBe(true);
    expect(isSpoolLow(s({ remaining_g: 400 }))).toBe(false);
    expect(isSpoolLow(s({ remaining_g: 0, status: "vazia" }))).toBe(false);
    expect(isOverCommitted(s({ remaining_g: 100, reserved_g: 150 }))).toBe(true);
  });
});
