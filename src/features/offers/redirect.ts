import { isSafeDestination } from "./affiliate";

export const CLICK_ORIGINS = ["site", "alerta", "email", "calculadora"] as const;
export type ClickOrigin = (typeof CLICK_ORIGINS)[number];
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const parseOrigin = (v: string | null | undefined): ClickOrigin => ((CLICK_ORIGINS as readonly string[]).includes(v ?? "") ? (v as ClickOrigin) : "site");

/**
 * O destino SEMPRE vem do banco (oferta publicada) e é revalidado contra a lista de hosts da loja no momento do clique.
 * Nada vindo da URL do navegador (além do id da oferta) escolhe o destino.
 */
export function resolveRedirect(offer: { status: string; link_url: string } | null | undefined, store: { is_active: boolean; allowed_hosts: string[] } | null | undefined): string | null {
  if (!offer || !store || offer.status !== "publicada" || !store.is_active) return null;
  return isSafeDestination(offer.link_url, store.allowed_hosts)?.toString() ?? null;
}
