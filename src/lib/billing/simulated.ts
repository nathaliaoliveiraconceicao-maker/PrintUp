import { hmacHex, verifyHmac } from "./signature";
import type { BillingGateway, CanonicalEvent, CheckoutRequest, CheckoutResult, GatewaySnapshot } from "./gateway";

export const SIMULATED_SIGNATURE_HEADER = "x-simulated-signature";

/**
 * Gateway FALSO para desenvolvimento e testes. Não cobra ninguém.
 * O "pagamento" é um clique na tela de simulação, que assina um webhook com o segredo e o envia à rota real
 * `/api/webhooks/billing` — o mesmo caminho (verificação, idempotência, ordem) que um gateway de verdade usaria.
 */
export class SimulatedGateway implements BillingGateway {
  readonly id = "simulado";
  constructor(private readonly secret: string | undefined) {}

  async createCheckout(req: CheckoutRequest): Promise<CheckoutResult> {
    return { gatewayRef: `sim_${req.checkoutId}`, url: `/assinatura/simulador/${req.checkoutId}` };
  }
  async cancelSubscription(): Promise<void> {}
  async changePlan(): Promise<void> {}

  verifyWebhook(rawBody: string, headers: Headers): boolean {
    return verifyHmac(this.secret, rawBody, headers.get(SIMULATED_SIGNATURE_HEADER));
  }
  parseWebhook(rawBody: string): CanonicalEvent[] {
    const data = JSON.parse(rawBody) as { events?: CanonicalEvent[] };
    return Array.isArray(data.events) ? data.events.map((e) => ({ ...e, gateway: "simulado" })) : [];
  }
  async fetchSnapshot(): Promise<GatewaySnapshot | null> {
    return null; // o simulador não guarda estado externo
  }

  /** Corpo + assinatura de um webhook simulado (usado pela tela de simulação). */
  static sign(secret: string, events: CanonicalEvent[]): { body: string; signature: string } {
    const body = JSON.stringify({ events });
    return { body, signature: hmacHex(secret, body) };
  }
}
