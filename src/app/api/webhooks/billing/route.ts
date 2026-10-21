import { handleBillingWebhook } from "@/features/billing/webhook";
import { resolveGateway } from "@/lib/billing/gateway";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

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
    log: (message, meta) => console.info(JSON.stringify({ at: new Date().toISOString(), scope: "billing", message, ...meta })),
  });
}
