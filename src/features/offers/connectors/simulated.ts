import { toCents } from "../pricing";
import type { RawProduct, StoreConnector } from "./types";

/** SÓ para desenvolvimento e testes. Nunca é registrado em produção sem `OFFERS_ALLOW_SIMULATED=sim` e as ofertas saem marcadas como simuladas. */
export const simulatedConnector: StoreConnector = {
  id: "simulado",
  label: "Dados simulados (somente desenvolvimento)",
  requiredEnv: [],
  rateLimit: { max: 100, perMs: 1000 },
  status: "somente_desenvolvimento",
  async fetchProducts(ctx): Promise<RawProduct[]> {
    const day = Number(ctx.config.day ?? 0);
    const wobble = (base: number, seed: number) => toCents(base + ((day * 7 + seed * 13) % 9) - 4);
    return [
      { externalId: "sim-pla-1", title: "[SIMULADO] Filamento PLA Marca Exemplo 1kg 1.75mm", brand: "Marca Exemplo", imageUrl: "https://exemplo.invalid/pla.jpg", productUrl: "https://simulada.example.com/pla-1kg", priceCents: wobble(70, 1), declaredPreviousCents: toCents(95), inStock: true, shippingCents: 0 },
      { externalId: "sim-petg-1", title: "[SIMULADO] Filamento PETG Marca Exemplo 1kg 1.75mm", brand: "Marca Exemplo", imageUrl: "https://exemplo.invalid/petg.jpg", productUrl: "https://simulada.example.com/petg-1kg", priceCents: wobble(85, 2), inStock: true },
      { externalId: "sim-bico-1", title: "[SIMULADO] Bico nozzle 0.4mm latão (kit 5)", brand: "Marca Exemplo", imageUrl: "https://exemplo.invalid/bico.jpg", productUrl: "https://simulada.example.com/bico", priceCents: wobble(30, 3), declaredPreviousCents: toCents(32), inStock: true },
    ];
  },
};
