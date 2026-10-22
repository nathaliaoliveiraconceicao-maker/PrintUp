import { describe, expect, it } from "vitest";
import { probeMercadoPago } from "./probe";

type Req = { url: string; method: string; body?: Record<string, unknown> };
function fake(handler: (r: Req) => { status: number; json: unknown }) {
  const calls: Req[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const r = { url: url.replace("https://api.mercadopago.com", ""), method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(r);
    const out = handler(r);
    return new Response(JSON.stringify(out.json), { status: out.status });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe("probeMercadoPago", () => {
  it("recusa rodar com credencial de conta real (nenhum pedido de criação é feito)", async () => {
    const { fetchImpl, calls } = fake((r) => (r.url === "/users/me" ? { status: 200, json: { nickname: "LOJA", tags: ["normal"] } } : { status: 500, json: {} }));
    const lines = await probeMercadoPago({ accessToken: "APP_USR-real-1", siteUrl: "https://x.com", fetchImpl });
    expect(lines).toHaveLength(1);
    expect(lines[0].detail).toMatch(/não é de uma conta de teste/);
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("mostra o resultado de cada variação, cancela as aceitas e não vaza e-mails", async () => {
    const { fetchImpl, calls } = fake((r) => {
      if (r.url === "/users/me") return { status: 200, json: { nickname: "TESTUSER1", site_id: "MLB", user_type: "normal", tags: ["test_user"] } };
      if (r.method === "POST") {
        const ref = r.body?.external_reference;
        if (ref === "probe-c") return { status: 201, json: { id: "pre_ok_1" } };
        return { status: 400, json: { message: `User bad request para ${String(r.body?.payer_email ?? "sem")}`, cause: [{ code: 4001 }] } };
      }
      return { status: 200, json: {} };
    });
    const lines = await probeMercadoPago({ accessToken: "APP_USR-teste-1", siteUrl: "https://app.exemplo.com/", testPayerEmail: "test_user_111@testuser.com", fetchImpl });
    expect(lines[0].label).toBe("Conta da credencial");
    const byLabel = Object.fromEntries(lines.map((l) => [l.label.slice(0, 1), l]));
    expect(byLabel.A.ok).toBe(false);
    expect(byLabel.A.detail).toContain("User bad request");
    expect(byLabel.A.detail).toContain("[e-mail]");
    expect(byLabel.C.ok).toBe(true);
    expect(JSON.stringify(lines)).not.toMatch(/@testuser\.com|pre_ok_1/);
    expect(calls.some((c) => c.method === "PUT" && c.url === "/preapproval/pre_ok_1" && c.body?.status === "cancelled")).toBe(true);
  });
});
