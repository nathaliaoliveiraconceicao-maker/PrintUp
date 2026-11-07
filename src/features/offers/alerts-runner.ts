import { alertMatches, shouldNotify } from "./alerts";
import type { OffersRepo } from "./repo";
import type { EmailMessage, EmailResult } from "@/lib/email";
import { formatBRL } from "@/lib/utils";

export type AlertDeps = {
  repo: OffersRepo;
  now?: () => Date;
  siteUrl: string;
  /** e-mail do usuário (vem do cadastro; nunca fica no módulo de ofertas) */
  getEmail: (userId: string) => Promise<string | null>;
  send: (m: EmailMessage) => Promise<EmailResult>;
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

export function buildAlertEmail(a: { title: string; priceText: string; discountText: string | null; store: string; offerUrl: string; manageUrl: string }): EmailMessage & { to: "" } {
  const lines = [`${a.title}`, `Preço agora: ${a.priceText}${a.discountText ? ` (${a.discountText})` : ""}`, `Loja: ${a.store}`, `Ver oferta: ${a.offerUrl}`, "", "Este e-mail contém link de afiliado: o PrintUp pode receber comissão se você comprar, sem custo extra para você.", `Você recebeu porque criou um alerta. Gerencie ou apague em ${a.manageUrl}`];
  return {
    to: "",
    subject: `Alerta PrintUp: ${a.title}`.slice(0, 120),
    text: lines.join("\n"),
    html: `<p><strong>${esc(a.title)}</strong></p><p>Preço agora: <strong>${esc(a.priceText)}</strong>${a.discountText ? ` (${esc(a.discountText)})` : ""}<br>Loja: ${esc(a.store)}</p><p><a href="${esc(a.offerUrl)}">Ver oferta</a></p><p style="color:#666;font-size:12px">Este e-mail contém link de afiliado: o PrintUp pode receber comissão se você comprar, sem custo extra para você.<br>Você recebeu porque criou um alerta. <a href="${esc(a.manageUrl)}">Gerenciar alertas</a></p>`,
  };
}

/** Cruza ofertas verificadas recentemente com os alertas ativos. Não repete aviso (intervalo + queda mínima de preço). */
export async function processAlerts(deps: AlertDeps, sinceHours = 26): Promise<{ avaliados: number; enviados: number; sem_provedor: number; falhas: number }> {
  const now = (deps.now ?? (() => new Date()))();
  const out = { avaliados: 0, enviados: 0, sem_provedor: 0, falhas: 0 };
  const [alerts, offers] = await Promise.all([deps.repo.activeAlerts(), deps.repo.recentPublishedOffers(new Date(now.getTime() - sinceHours * 3_600_000))]);
  for (const alert of alerts) {
    if (alert.channel !== "email") continue; // WhatsApp/push: arquitetura preparada, exige consentimento e integração autorizada
    for (const offer of offers) {
      out.avaliados++;
      if (!alertMatches(alert.rule, offer)) continue;
      const last = await deps.repo.lastNotification(alert.id, offer.id);
      if (!shouldNotify({ lastNotifiedPriceCents: last?.priceCents ?? null, lastNotifiedAt: last?.sentAt ?? null, priceCents: offer.priceCents, now, cooldownHours: alert.cooldownHours })) continue;
      const email = await deps.getEmail(alert.userId);
      if (!email) continue;
      const info = { title: offer.title, priceText: formatBRL(offer.priceCents / 100), discountText: offer.discountPct !== null ? `${offer.discountPct.toString().replace(".", ",")}% abaixo do preço anterior` : null, store: offer.storeName ?? offer.storeCode };
      const msg = buildAlertEmail({ ...info, offerUrl: `${deps.siteUrl}/ir/${offer.id}?o=alerta`, manageUrl: `${deps.siteUrl}/alertas` });
      const status = await deps.send({ ...msg, to: email });
      await deps.repo.recordNotification({ alertId: alert.id, offerId: offer.id, priceCents: offer.priceCents, channel: "email", status, at: now });
      if (status === "enviada") out.enviados++; else if (status === "sem_provedor") out.sem_provedor++; else out.falhas++;
    }
  }
  return out;
}
