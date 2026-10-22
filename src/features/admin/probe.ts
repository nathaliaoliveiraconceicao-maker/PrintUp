import { mercadoPagoIsTest, mercadoPagoIsTestAccount, sanitizeGatewayText } from "@/lib/billing/mercadopago";

export type ProbeLine = { label: string; ok: boolean; detail: string };

const API = "https://api.mercadopago.com";

type Cfg = { accessToken: string; siteUrl: string; testPayerEmail?: string; /** E-mails de comprador para experimentar (a tela nunca os repete). */ candidates?: string[]; fetchImpl?: typeof fetch };

/**
 * Teste de conexão (SÓ conta de teste): consulta a conta e tenta criar uma assinatura "pendente" com variações do pedido,
 * para descobrir qual o Mercado Pago aceita. Mostra só status e uma explicação curta e sanitizada; nunca tokens, e-mails ou ids.
 * Assinaturas criadas no teste são canceladas em seguida.
 */
export async function probeMercadoPago(cfg: Cfg): Promise<ProbeLine[]> {
  const f = cfg.fetchImpl ?? fetch;
  const lines: ProbeLine[] = [];
  const isTest = mercadoPagoIsTest(cfg.accessToken) || (await mercadoPagoIsTestAccount(cfg.accessToken, f));
  if (!isTest) return [{ label: "Segurança", ok: false, detail: "Esta credencial não é de uma conta de teste: o teste não será executado." }];

  const call = async (path: string, method: string, body?: unknown) => {
    try {
      const res = await f(`${API}${path}`, { method, headers: { authorization: `Bearer ${cfg.accessToken}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10_000), cache: "no-store" });
      let json: Record<string, unknown> = {};
      try { json = (await res.json()) as Record<string, unknown>; } catch { /* sem JSON */ }
      return { status: res.status, json };
    } catch {
      return { status: 0, json: {} as Record<string, unknown> };
    }
  };

  const me = await call("/users/me", "GET");
  if (me.status === 200) {
    const tags = Array.isArray(me.json.tags) ? (me.json.tags as unknown[]).map((t) => sanitizeGatewayText(t)).join(", ") : "";
    lines.push({ label: "Conta da credencial", ok: true, detail: `país: ${sanitizeGatewayText(me.json.site_id)} · tipo: ${sanitizeGatewayText(me.json.user_type) || "?"} · marcas: ${tags || "—"}` });
  } else lines.push({ label: "Conta da credencial", ok: false, detail: `não respondeu (HTTP ${me.status})` });

  const base = { reason: "PrintUp teste de conexão", back_url: `${cfg.siteUrl.replace(/\/$/, "")}/assinatura`, status: "pending", auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: 29.9, currency_id: "BRL" } };
  const emailOk = (e: string) => /^[^@\s]{1,80}@[^@\s]{3,80}$/.test(e);
  const variants: { label: string; body: Record<string, unknown> }[] = [];
  if (cfg.testPayerEmail) variants.push({ label: "A. e-mail configurado na Vercel", body: { ...base, external_reference: "probe-a", payer_email: cfg.testPayerEmail } });
  (cfg.candidates ?? []).filter(emailOk).slice(0, 6).forEach((email, n) => variants.push({ label: `Candidato ${n + 1}`, body: { ...base, external_reference: `probe-c${n + 1}`, payer_email: email } }));
  if (variants.length === 0) lines.push({ label: "Experimentos", ok: false, detail: "Digite ao menos um e-mail de comprador para experimentar." });
  for (const v of variants) {
    const r = await call("/preapproval", "POST", v.body);
    if (r.status >= 200 && r.status < 300) {
      lines.push({ label: v.label, ok: true, detail: `aceito (HTTP ${r.status}); assinatura de teste criada e cancelada` });
      const id = typeof r.json.id === "string" && /^[A-Za-z0-9_-]{4,64}$/.test(r.json.id) ? r.json.id : null;
      if (id) await call(`/preapproval/${encodeURIComponent(id)}`, "PUT", { status: "cancelled" });
    } else {
      const cause = Array.isArray(r.json.cause) ? (r.json.cause as { code?: unknown; description?: unknown }[])[0] : undefined;
      const code = cause?.code !== undefined && /^[A-Za-z0-9_]{1,40}$/.test(String(cause.code)) ? ` · código ${cause.code}` : "";
      lines.push({ label: v.label, ok: false, detail: `recusado (HTTP ${r.status}${code}): ${sanitizeGatewayText(r.json.message) || sanitizeGatewayText(cause?.description) || "sem explicação"}` });
    }
  }
  return lines;
}
