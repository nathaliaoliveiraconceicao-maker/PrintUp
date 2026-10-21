import { parseCanonicalEvents } from "@/lib/billing/events";
import { GatewayUnavailableError, type BillingGateway, type CanonicalEvent } from "@/lib/billing/gateway";

export interface WebhookDeps {
  gateway: BillingGateway | null;
  /** Aplica um evento já validado (no servidor: função SQL `apply_billing_event` com a chave de serviço). */
  apply: (event: CanonicalEvent) => Promise<{ result: string }>;
  /** Log estruturado SEM payload, segredos ou dados pessoais: só ids de evento e resultados. */
  log: (message: string, meta?: Record<string, unknown>) => void;
  maxBytes?: number;
}

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

/**
 * Recebe o webhook do gateway:
 *  1) confere a AUTENTICIDADE no corpo bruto antes de interpretar qualquer coisa;
 *  2) valida cada evento; 3) aplica com idempotência (o banco recusa repetidos);
 * Respostas: 401 assinatura inválida · 400/413 corpo ruim · 500 falha nossa (o gateway tenta de novo) · 200 recebido.
 */
export async function handleBillingWebhook(req: Request, deps: WebhookDeps): Promise<Response> {
  const { gateway, apply, log } = deps;
  if (!gateway) return json(503, { error: "billing_disabled" });
  const max = deps.maxBytes ?? 256 * 1024;

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > max) return json(413, { error: "payload_too_large" });
  const raw = await req.text();
  if (Buffer.byteLength(raw, "utf8") > max) return json(413, { error: "payload_too_large" });

  if (!gateway.verifyWebhook(raw, req.headers)) {
    log("webhook_assinatura_invalida", { gateway: gateway.id });
    return json(401, { error: "invalid_signature" });
  }

  let events: CanonicalEvent[];
  try {
    const parsed = await gateway.parseWebhook(raw);
    const checked = parseCanonicalEvents(parsed);
    if (checked.invalid > 0 && checked.events.length === 0) return json(400, { error: "invalid_events" });
    events = checked.events.map((e) => ({ ...e, gateway: gateway.id }));
  } catch (e) {
    if (e instanceof GatewayUnavailableError) {
      log("webhook_gateway_indisponivel", { gateway: gateway.id });
      return json(500, { error: "gateway_unavailable" });
    }
    return json(400, { error: "invalid_body" });
  }

  const results: { event_id: string; result: string }[] = [];
  for (const e of events) {
    try {
      const r = await apply(e);
      results.push({ event_id: e.event_id, result: r.result });
      log("webhook_evento", { event_id: e.event_id, type: e.type, result: r.result });
    } catch {
      // Falha transitória (banco fora do ar etc.): 500 faz o gateway reenviar; a idempotência evita efeito duplicado.
      log("webhook_erro_ao_aplicar", { event_id: e.event_id, type: e.type });
      return json(500, { error: "apply_failed", event_id: e.event_id });
    }
  }
  return json(200, { ok: true, results });
}
