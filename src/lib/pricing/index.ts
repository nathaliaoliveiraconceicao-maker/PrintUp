export * from "./types";
export * from "./calculate";
export { pricingInputSchema } from "./schema";

/** Versão das fórmulas gravada em cada precificação salva (incrementar se o resultado mudar para a mesma entrada). */
export const PRICING_ENGINE_VERSION = 1;
export * from "./groups";
export * from "./discount";
