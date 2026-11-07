import { feedConnector } from "./feed";
import { mercadoLivreConnector } from "./mercadolivre";
import { shopeeConnector } from "./shopee";
import { simulatedConnector } from "./simulated";
import type { StoreConnector } from "./types";

/** Conectores conhecidos. O simulado só existe quando `OFFERS_ALLOW_SIMULATED=sim` (desenvolvimento/testes). */
export function connectorFor(id: string, env: Record<string, string | undefined> = process.env): StoreConnector | null {
  switch (id) {
    case "feed_manual": return feedConnector;
    case "shopee": return shopeeConnector;
    case "mercadolivre": return mercadoLivreConnector;
    case "simulado": return env.OFFERS_ALLOW_SIMULATED === "sim" ? simulatedConnector : null;
    default: return null;
  }
}
export const ALL_CONNECTORS = [feedConnector, shopeeConnector, mercadoLivreConnector, simulatedConnector] as const;
