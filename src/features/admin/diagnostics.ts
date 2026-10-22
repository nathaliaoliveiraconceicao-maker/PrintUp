export type DiagItem = { name: string; ok: boolean; detail: string };
export type BillingDiagnosis = { enabled: boolean; summary: string; items: DiagItem[] };

/**
 * Diagnóstico da configuração de pagamentos. NUNCA devolve valores: só se a variável existe e se o formato é o esperado
 * (por exemplo, "começa com TEST-"). Serve para o superadmin descobrir o que falta sem abrir segredos.
 */
export function diagnoseBilling(env: Record<string, string | undefined>): BillingDiagnosis {
  const items: DiagItem[] = [];
  const has = (k: string) => Boolean(env[k] && env[k]!.trim() !== "");
  const raw = (k: string) => env[k] ?? "";

  items.push(has("SUPABASE_SERVICE_ROLE_KEY")
    ? { name: "SUPABASE_SERVICE_ROLE_KEY", ok: true, detail: "definida" }
    : { name: "SUPABASE_SERVICE_ROLE_KEY", ok: false, detail: "ausente neste ambiente (precisa estar em Production)" });

  const gw = raw("BILLING_GATEWAY");
  items.push(gw === "mercadopago"
    ? { name: "BILLING_GATEWAY", ok: true, detail: "mercadopago" }
    : { name: "BILLING_GATEWAY", ok: false, detail: !has("BILLING_GATEWAY") ? "ausente" : gw !== gw.trim() ? "tem espaço no começo ou no fim" : gw === "simulado" ? "está como 'simulado' (só serve em desenvolvimento)" : `valor inesperado (tamanho ${gw.length}); deve ser exatamente: mercadopago` });

  const token = raw("MERCADOPAGO_ACCESS_TOKEN");
  items.push(!has("MERCADOPAGO_ACCESS_TOKEN")
    ? { name: "MERCADOPAGO_ACCESS_TOKEN", ok: false, detail: "ausente" }
    : token !== token.trim() ? { name: "MERCADOPAGO_ACCESS_TOKEN", ok: false, detail: "tem espaço ou quebra de linha no começo ou no fim" }
    : token.startsWith("TEST-") ? { name: "MERCADOPAGO_ACCESS_TOKEN", ok: true, detail: "credencial de TESTE (começa com TEST-)" }
    : token.startsWith("APP_USR-") ? (env.BILLING_ALLOW_LIVE === "sim"
        ? { name: "MERCADOPAGO_ACCESS_TOKEN", ok: true, detail: "credencial de PRODUÇÃO com cobrança real autorizada" }
        : { name: "MERCADOPAGO_ACCESS_TOKEN", ok: false, detail: "é credencial de PRODUÇÃO (APP_USR-) e a cobrança real está bloqueada; use a de teste (TEST-)" })
    : { name: "MERCADOPAGO_ACCESS_TOKEN", ok: false, detail: `formato inesperado (começa com outra coisa, tamanho ${token.length}); pode ser a Public Key ou outro campo` });

  const secret = raw("MERCADOPAGO_WEBHOOK_SECRET");
  items.push(!has("MERCADOPAGO_WEBHOOK_SECRET")
    ? { name: "MERCADOPAGO_WEBHOOK_SECRET", ok: false, detail: "ausente" }
    : secret.trim().length < 16 ? { name: "MERCADOPAGO_WEBHOOK_SECRET", ok: false, detail: `curta demais (${secret.trim().length} caracteres; o mínimo é 16): copie a assinatura secreta inteira` }
    : secret !== secret.trim() ? { name: "MERCADOPAGO_WEBHOOK_SECRET", ok: false, detail: "tem espaço ou quebra de linha no começo ou no fim" }
    : { name: "MERCADOPAGO_WEBHOOK_SECRET", ok: true, detail: `definida (${secret.length} caracteres)` });

  const site = raw("NEXT_PUBLIC_SITE_URL");
  items.push(!has("NEXT_PUBLIC_SITE_URL")
    ? { name: "NEXT_PUBLIC_SITE_URL", ok: false, detail: "ausente" }
    : /^https:\/\/[^\s/]+\/?$/.test(site) ? { name: "NEXT_PUBLIC_SITE_URL", ok: true, detail: "endereço https válido" }
    : { name: "NEXT_PUBLIC_SITE_URL", ok: false, detail: "deve ser só o endereço, com https:// e sem espaços (ex.: https://print-up-six.vercel.app)" });

  const email = raw("MERCADOPAGO_TEST_PAYER_EMAIL");
  items.push(!has("MERCADOPAGO_TEST_PAYER_EMAIL")
    ? { name: "MERCADOPAGO_TEST_PAYER_EMAIL", ok: true, detail: "ausente (usa o e-mail de quem contrata; para testar, defina o do comprador de teste)" }
    : /^[^@\s]+@testuser\.com$/i.test(email) ? { name: "MERCADOPAGO_TEST_PAYER_EMAIL", ok: true, detail: "e-mail de comprador de teste (@testuser.com)" }
    : { name: "MERCADOPAGO_TEST_PAYER_EMAIL", ok: false, detail: "não parece e-mail de comprador de teste (deveria terminar em @testuser.com)" });

  const required = items.filter((i) => i.name !== "MERCADOPAGO_TEST_PAYER_EMAIL");
  const enabled = required.every((i) => i.ok);
  const bad = items.filter((i) => !i.ok).map((i) => i.name);
  return { enabled, summary: enabled ? "Pagamentos habilitados neste ambiente." : `Pagamentos desligados. Corrigir: ${bad.join(", ")}.`, items };
}
