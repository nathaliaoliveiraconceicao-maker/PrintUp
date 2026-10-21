import { handleBillingWebhook } from "@/features/billing/webhook";
import { resolveGateway } from "@/lib/billing/gateway";
import { logEvent } from "@/features/admin/log";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Assinatura inválida pode ser spam: registra no monitoramento no máximo 1 vez por minuto por instância.
let lastInvalidLogAt = 0;
const MONITORED: Record<string, { kind: "webhook" | "seguranca"; severity: "aviso" | "erro"; text: string }> = {
  webhook_assinatura_invalida: { kind: "seguranca", severity: "aviso", text: "Webhook recusado: assinatura inválida" },
  webhook_erro_ao_aplicar: { kind: "webhook", severity: "erro", text: "Falha ao aplicar evento de cobrança" },
  webhook_gateway_indisponivel: { kind: "webhook", severity: "erro", text: "Gateway indisponível ao processar webhook" },
};

export async function POST(req: Request) {
  const status = await resolveGateway();
  if (!status.enabled) return new Response(JSON.stringify({ error: "billing_disabled" }), { status: 503, headers: { "content-type": "application/json" } });
  const admin = createAdminClient();
  return handleBillingWebhook(req, {
    gateway: status.gateway,
    apply: async (event) => {
      const { data, error } = await admin.rpc("apply_billing_event", { p_event: event });
      if (error) throw new Error("apply_billing_event");
      return data as { result: string };
    },
    log: (message, meta) => {
      console.info(JSON.stringify({ at: new Date().toISOString(), scope: "billing", message, ...meta }));
      const m = MONITORED[message];
      if (!m) return;
      if (message === "webhook_assinatura_invalida") {
        if (Date.now() - lastInvalidLogAt < 60_000) return;
        lastInvalidLogAt = Date.now();
      }
      void logEvent(m.kind, m.severity, m.text, { gateway: String(meta?.gateway ?? ""), event_id: String(meta?.event_id ?? "") });
    },
  });
}
