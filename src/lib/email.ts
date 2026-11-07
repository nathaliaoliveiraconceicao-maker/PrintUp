/** Envio de e-mail transacional. Provedor: Resend (HTTP). Sem as variáveis, NÃO envia (e diz isso): nada é simulado como enviado. */
export type EmailResult = "enviada" | "sem_provedor" | "falhou";
export type EmailMessage = { to: string; subject: string; html: string; text: string };

export function emailConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.RESEND_API_KEY?.trim() && env.EMAIL_FROM?.trim());
}

export async function sendEmail(msg: EmailMessage, env: Record<string, string | undefined> = process.env, fetchImpl: typeof fetch = fetch): Promise<EmailResult> {
  if (!emailConfigured(env)) return "sem_provedor";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(msg.to)) return "falhou";
  try {
    const res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [msg.to], subject: msg.subject.slice(0, 200), html: msg.html, text: msg.text }),
    });
    return res.ok ? "enviada" : "falhou";
  } catch {
    return "falhou";
  }
}
