import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
let admin: { supabase: { rpc: typeof rpc }; userId: string } | null = null;

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("./guard", () => ({ currentAdmin: async () => admin }));
vi.mock("./log", () => ({ logEvent: vi.fn() }));
vi.mock("@/lib/billing/gateway", () => ({ resolveGateway: async () => ({ enabled: false, reason: "sem_gateway" }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => { throw new Error("não deve ser usado"); } }));

import { createCoupon, endCourtesy, grantCourtesy, saveSettings, scheduleCancel, setCouponActive, updatePlan } from "./actions";

const fd = (o: Record<string, string>) => Object.assign(new FormData(), {}, (() => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; })());
const UID = "a0000000-0000-4000-8000-000000000003";

beforeEach(() => { rpc.mockReset(); admin = null; });

describe("ações administrativas: autorização no servidor", () => {
  it("quem não é superadmin é recusado em TODAS as ações, sem tocar no banco", async () => {
    const results = await Promise.all([
      updatePlan("pro", {}, fd({ name: "x", confirmar: "on" })),
      grantCourtesy({}, fd({ userId: UID, planCode: "pro", days: "5", reason: "teste" })),
      endCourtesy({}, fd({ userId: UID, reason: "teste" })),
      scheduleCancel({}, fd({ userId: UID, reason: "teste", confirmar: "on" })),
      createCoupon({}, fd({ code: "ABCDE", planCode: "pro", days: "5" })),
      setCouponActive("a0000000-0000-4000-8000-000000000003", true),
      saveSettings({}, fd({ billing_grace_days: "7", support_email: "", terms_url: "", privacy_url: "" })),
    ]);
    for (const r of results) expect(r.error).toBe("Acesso restrito.");
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("ações com superadmin", () => {
  beforeEach(() => { admin = { supabase: { rpc }, userId: "adm" }; });

  it("plano: exige confirmação antes de qualquer chamada", async () => {
    const r = await updatePlan("pro", {}, fd({ name: "Pro", price: "10", sortOrder: "1" }));
    expect(r.error).toMatch(/confirmação/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("repassa a mensagem de regra do banco (P0001) e esconde erro interno", async () => {
    rpc.mockResolvedValueOnce({ error: { code: "P0001", message: "Já existe um cupom com este código" } });
    expect((await createCoupon({}, fd({ code: "ABCDE", planCode: "pro", days: "5" }))).error).toBe("Já existe um cupom com este código");
    rpc.mockResolvedValueOnce({ error: { code: "XX000", message: "relation \"coupons\" blew up at /var/lib/..." } });
    const r = await createCoupon({}, fd({ code: "ABCDF", planCode: "pro", days: "5" }));
    expect(r.error).toBe("Não foi possível salvar. Tente novamente.");
  });

  it("cortesia: valida entrada e chama a função do banco com dias inteiros", async () => {
    expect((await grantCourtesy({}, fd({ userId: "x", planCode: "pro", days: "5", reason: "ok ok" }))).error).toBeTruthy();
    rpc.mockResolvedValueOnce({ error: null });
    expect((await grantCourtesy({}, fd({ userId: UID, planCode: "pro", days: "30", reason: "parceria" }))).ok).toBe("Cortesia concedida.");
    expect(rpc).toHaveBeenCalledWith("admin_grant_courtesy", { p_user: UID, p_plan_code: "pro", p_days: 30, p_reason: "parceria" });
  });

  it("cancelar assinatura paga: sem gateway habilitado nada é alterado (o pagamento não é tocado)", async () => {
    const r = await scheduleCancel({}, fd({ userId: UID, reason: "pedido do cliente", confirmar: "on" }));
    expect(r.error).toMatch(/gateway/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("não existe ação para marcar pagamento como concluído", async () => {
    const mod = await import("./actions");
    expect(Object.keys(mod).filter((k) => /pagamento|paid|payment|charge|cobran/i.test(k))).toEqual([]);
  });
});
