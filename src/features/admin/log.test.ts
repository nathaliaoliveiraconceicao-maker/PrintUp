import { describe, expect, it } from "vitest";
import { sanitizeMeta } from "./log";

describe("sanitizeMeta (logs sem dados sensíveis)", () => {
  it("mantém só ids/códigos/números simples", () => {
    expect(sanitizeMeta({ gateway: "mercadopago", http: 500, ok: false, event_id: "mp:ap:77:processed" })).toEqual({ gateway: "mercadopago", http: 500, ok: false, event_id: "mp:ap:77:processed" });
  });
  it("descarta e-mails, textos livres, objetos e chaves estranhas", () => {
    expect(sanitizeMeta({ email: "a@b.com", note: "texto com espaços e @", obj: { a: 1 }, "Chave Ruim": "x", token: "Bearer abc def" })).toEqual({});
  });
});
