import { describe, expect, it } from "vitest";
import { z } from "zod";
import { checkbox, decimal, dbErrorMessage, zodToState } from "./forms";

describe("decimal", () => {
  const s = z.object({ v: decimal({ max: 100 }) });
  it("interpreta pt-BR e vazio como 0", () => {
    expect(s.parse({ v: "12,5" }).v).toBe(12.5);
    expect(s.parse({ v: "" }).v).toBe(0);
  });
  it("rejeita lixo, negativo e acima do máximo", () => {
    expect(s.safeParse({ v: "abc" }).success).toBe(false);
    expect(s.safeParse({ v: "-1" }).success).toBe(false);
    expect(s.safeParse({ v: "101" }).success).toBe(false);
  });
});

describe("checkbox", () => {
  it("on => true, ausente => false", () => {
    const s = z.object({ c: checkbox });
    expect(s.parse({ c: "on" }).c).toBe(true);
    expect(s.parse({ c: undefined }).c).toBe(false);
  });
});

describe("zodToState / dbErrorMessage", () => {
  it("mapeia erros por campo", () => {
    const r = z.object({ a: z.string().min(2, "curto") }).safeParse({ a: "x" });
    if (r.success) throw new Error();
    expect(zodToState(r.error).fieldErrors).toEqual({ a: "curto" });
  });
  it("traduz limite de plano", () => {
    expect(dbErrorMessage({ code: "P0001", message: "Limite do plano atingido (max_printers)" })).toMatch(/limite/i);
    expect(dbErrorMessage({ code: "XX" })).toMatch(/Não foi possível/);
  });
  it("mostra as mensagens próprias de estoque e pedidos, sem vazar texto técnico", () => {
    expect(dbErrorMessage({ code: "P0001", message: "Estoque insuficiente: faltam 900.0 g de PLA Preto" })).toMatch(/faltam 900/);
    expect(dbErrorMessage({ code: "P0001", message: "Só orçamentos aprovados viram pedido" })).toMatch(/aprovados/);
    expect(dbErrorMessage({ code: "P0001", message: "O valor passa do saldo a receber do pedido" })).toMatch(/saldo/);
    expect(dbErrorMessage({ code: "P0002", message: "x" })).toMatch(/não encontrado/);
    expect(dbErrorMessage({ code: "P0001", message: "relation foo violates something" })).not.toMatch(/relation/);
  });
  it("traduz as regras de orçamento sem vazar texto técnico", () => {
    expect(dbErrorMessage({ code: "P0001", message: "Orçamento enviado ou decidido não pode ser alterado. Duplique-o." })).toMatch(/Duplique/);
    expect(dbErrorMessage({ code: "P0001", message: "Mudança de status não permitida (aprovado -> rascunho)" })).not.toMatch(/->/);
    expect(dbErrorMessage({ code: "P0001", message: "Os totais do orçamento não fecham com a soma dos itens" })).toMatch(/não fecham/);
  });
});
