import { describe, expect, it } from "vitest";
import { diagnoseBilling } from "./diagnostics";

const OK = { SUPABASE_SERVICE_ROLE_KEY: "x".repeat(30), BILLING_GATEWAY: "mercadopago", MERCADOPAGO_ACCESS_TOKEN: "TEST-123456-abc", MERCADOPAGO_WEBHOOK_SECRET: "s".repeat(32), NEXT_PUBLIC_SITE_URL: "https://print-up-six.vercel.app", MERCADOPAGO_TEST_PAYER_EMAIL: "TESTUSER1@testuser.com" };
const bad = (env: Record<string, string | undefined>) => diagnoseBilling(env).items.filter((i) => !i.ok).map((i) => i.name);

describe("diagnoseBilling", () => {
  it("configuração correta → habilitado", () => {
    const d = diagnoseBilling(OK);
    expect(d.enabled).toBe(true);
    expect(bad(OK)).toEqual([]);
  });
  it("aponta exatamente o que falta ou está errado", () => {
    expect(bad({ ...OK, BILLING_GATEWAY: "Mercadopago" })).toEqual(["BILLING_GATEWAY"]);
    expect(bad({ ...OK, BILLING_GATEWAY: "mercadopago " })).toEqual(["BILLING_GATEWAY"]);
    expect(bad({ ...OK, MERCADOPAGO_ACCESS_TOKEN: "APP_USR-999" })).toEqual(["MERCADOPAGO_ACCESS_TOKEN"]);
    expect(bad({ ...OK, MERCADOPAGO_ACCESS_TOKEN: undefined })).toEqual(["MERCADOPAGO_ACCESS_TOKEN"]);
    expect(bad({ ...OK, MERCADOPAGO_WEBHOOK_SECRET: "curta" })).toEqual(["MERCADOPAGO_WEBHOOK_SECRET"]);
    expect(bad({ ...OK, NEXT_PUBLIC_SITE_URL: "print-up-six.vercel.app" })).toEqual(["NEXT_PUBLIC_SITE_URL"]);
    expect(bad({ ...OK, SUPABASE_SERVICE_ROLE_KEY: "" })).toEqual(["SUPABASE_SERVICE_ROLE_KEY"]);
  });
  it("produção só passa com a autorização explícita", () => {
    expect(diagnoseBilling({ ...OK, MERCADOPAGO_ACCESS_TOKEN: "APP_USR-999" }).enabled).toBe(false);
    expect(diagnoseBilling({ ...OK, MERCADOPAGO_ACCESS_TOKEN: "APP_USR-999", BILLING_ALLOW_LIVE: "sim" }).enabled).toBe(true);
  });
  it("NUNCA devolve valores de segredos", () => {
    const text = JSON.stringify(diagnoseBilling({ ...OK, MERCADOPAGO_ACCESS_TOKEN: "TEST-SEGREDO-ABC", MERCADOPAGO_WEBHOOK_SECRET: "SEGREDO-DO-WEBHOOK-1234567890" }));
    expect(text).not.toContain("SEGREDO");
    expect(text).not.toContain("xxxxxxxx");
  });
  it("e-mail do comprador é opcional, mas não pode ser um e-mail real", () => {
    expect(diagnoseBilling({ ...OK, MERCADOPAGO_TEST_PAYER_EMAIL: undefined }).enabled).toBe(true);
    expect(bad({ ...OK, MERCADOPAGO_TEST_PAYER_EMAIL: "pessoa@gmail.com" })).toEqual(["MERCADOPAGO_TEST_PAYER_EMAIL"]);
  });
});
