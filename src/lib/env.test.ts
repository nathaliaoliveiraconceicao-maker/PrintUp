import { afterEach, describe, expect, it, vi } from "vitest";
import { getSupabaseEnv, invalidEnvVars } from "./env";

afterEach(() => vi.unstubAllEnvs());

describe("env do Supabase", () => {
  it("ausente => null e lista as duas variáveis", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    expect(getSupabaseEnv()).toBeNull();
    expect(invalidEnvVars()).toEqual(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]);
  });

  it("URL inválida e chave curta são rejeitadas", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "meu-projeto");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "curta");
    expect(getSupabaseEnv()).toBeNull();
    expect(invalidEnvVars()).toHaveLength(2);
  });

  it("valores bem formados são aceitos", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "x".repeat(40));
    expect(getSupabaseEnv()).toEqual({ url: "https://abc.supabase.co", anonKey: "x".repeat(40) });
    expect(invalidEnvVars()).toEqual([]);
  });
});
