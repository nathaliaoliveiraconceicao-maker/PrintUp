/**
 * Compartilhamento por WhatsApp SEM a API oficial: apenas o link `wa.me` com texto pronto.
 * O usuário confirma o envio no próprio aplicativo.
 */

/** Telefone brasileiro (DDD + número) em dígitos com 55; `null` se não parecer um telefone válido. */
export function normalizePhoneBR(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  if (!/^55\d{10,11}$/.test(d)) return null;
  const ddd = Number(d.slice(2, 4));
  if (ddd < 11 || ddd > 99) return null;
  if (d.length === 13 && d[4] !== "9") return null; // celular com 9º dígito
  return d;
}

export interface QuoteMessageInput {
  customerName: string;
  businessName: string | null;
  number: string;
  total: string;
  validUntil: string;
  link: string | null;
}

/** Texto do orçamento para o cliente. Nunca inclui custo interno nem margem. */
export function quoteMessage(q: QuoteMessageInput): string {
  const lines = [
    `Olá, ${q.customerName}! Segue o orçamento ${q.number}${q.businessName ? ` da ${q.businessName}` : ""}.`,
    `Total: ${q.total} · válido até ${q.validUntil}.`,
  ];
  if (q.link) lines.push(`PDF: ${q.link}`);
  lines.push("Qualquer dúvida, é só responder esta mensagem.");
  return lines.join("\n");
}

export function whatsappLink(phone: string | null | undefined, text: string): string {
  const to = normalizePhoneBR(phone);
  return `https://wa.me/${to ?? ""}?text=${encodeURIComponent(text)}`;
}
