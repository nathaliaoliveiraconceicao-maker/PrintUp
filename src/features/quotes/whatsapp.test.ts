import { describe, expect, it } from "vitest";
import { normalizePhoneBR, quoteMessage, whatsappLink } from "./whatsapp";

describe("normalizePhoneBR", () => {
  it("aceita formatos comuns", () => {
    expect(normalizePhoneBR("(11) 99999-0000")).toBe("5511999990000");
    expect(normalizePhoneBR("11 3333-4444")).toBe("551133334444");
    expect(normalizePhoneBR("+55 11 99999-0000")).toBe("5511999990000");
    expect(normalizePhoneBR("5511999990000")).toBe("5511999990000");
  });
  it("rejeita o que não é telefone", () => {
    expect(normalizePhoneBR("")).toBeNull();
    expect(normalizePhoneBR(null)).toBeNull();
    expect(normalizePhoneBR("12345")).toBeNull();
    expect(normalizePhoneBR("(05) 99999-0000")).toBeNull();
    expect(normalizePhoneBR("11 89999-0000")).toBeNull(); // celular sem o 9 inicial
  });
});

describe("mensagem e link", () => {
  const msg = quoteMessage({ customerName: "Ana", businessName: "Oficina X", number: "#0001", total: "R$ 94,50", validUntil: "20/01/2026", link: "https://x/y" });
  it("tem os dados do cliente e nenhum custo interno", () => {
    expect(msg).toContain("Ana");
    expect(msg).toContain("#0001");
    expect(msg).toContain("R$ 94,50");
    expect(msg).toContain("https://x/y");
    expect(msg.toLowerCase()).not.toMatch(/custo|margem|lucro/);
  });
  it("link wa.me com o telefone quando existe, sem ele quando não", () => {
    expect(whatsappLink("(11) 99999-0000", "oi a&b")).toBe("https://wa.me/5511999990000?text=oi%20a%26b");
    expect(whatsappLink(null, "oi")).toBe("https://wa.me/?text=oi");
  });
});
