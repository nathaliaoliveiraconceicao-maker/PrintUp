import { describe, expect, it } from "vitest";
import { confirmLinkSchema, forgotPasswordSchema, newPasswordSchema, safeNextPath } from "./schema";

describe("newPasswordSchema", () => {
  it("aceita senhas iguais com 8+ caracteres", () => {
    expect(newPasswordSchema.safeParse({ password: "12345678", confirm: "12345678" }).success).toBe(true);
  });
  it("rejeita senha curta", () => {
    expect(newPasswordSchema.safeParse({ password: "1234567", confirm: "1234567" }).success).toBe(false);
  });
  it("rejeita confirmação diferente e aponta o campo certo", () => {
    const r = newPasswordSchema.safeParse({ password: "12345678", confirm: "87654321" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].path).toEqual(["confirm"]);
  });
});

describe("forgotPasswordSchema", () => {
  it("valida e-mail", () => {
    expect(forgotPasswordSchema.safeParse({ email: "a@b.com" }).success).toBe(true);
    expect(forgotPasswordSchema.safeParse({ email: "abc" }).success).toBe(false);
  });
});

describe("safeNextPath", () => {
  it("só aceita destinos internos da lista", () => {
    expect(safeNextPath("/redefinir-senha")).toBe("/redefinir-senha");
  });
  it("bloqueia URLs externas e caminhos desconhecidos", () => {
    expect(safeNextPath("https://evil.com")).toBe("/");
    expect(safeNextPath("//evil.com")).toBe("/");
    expect(safeNextPath("/configuracoes")).toBe("/");
    expect(safeNextPath(null)).toBe("/");
  });
});

describe("confirmLinkSchema", () => {
  it("aceita só tipos e tokens bem formados", () => {
    expect(confirmLinkSchema.safeParse({ token_hash: "abcdef1234567890", type: "signup" }).success).toBe(true);
    expect(confirmLinkSchema.safeParse({ token_hash: "abcdef1234567890", type: "recovery", next: "/redefinir-senha" }).success).toBe(true);
    for (const bad of [{ token_hash: "curto", type: "signup" }, { token_hash: "abc def 12345678", type: "signup" }, { token_hash: "abcdef1234567890", type: "magiclink" }, { token_hash: "../../etc/passwd1", type: "email" }]) {
      expect(confirmLinkSchema.safeParse(bad).success).toBe(false);
    }
  });
});
