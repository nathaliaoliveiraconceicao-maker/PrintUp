/** Links de afiliado e destinos seguros. Nunca há redirecionamento para um endereço vindo do navegador. */
export type AffiliateConfig = {
  /** parâmetros fixos (ex.: o seu identificador de afiliado), anexados à URL do produto */
  params?: Record<string, string>;
  /** parâmetros que a URL final PRECISA ter para ser considerada rastreável */
  requiredParams?: string[];
  /** modelo de rastreador de parceiro, com {url} (URL do produto codificada); o host do rastreador também precisa estar na lista */
  template?: string;
};

const HOST = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

export function hostAllowed(hostname: string, allowedHosts: string[]): boolean {
  const h = hostname.toLowerCase();
  if (!HOST.test(h)) return false; // recusa IPs, "localhost", hosts malformados
  return allowedHosts.some((a) => {
    const base = a.toLowerCase().replace(/^\*\./, "");
    return h === base || h.endsWith(`.${base}`);
  });
}

/** https obrigatório, sem usuário/senha, host na lista da loja. */
export function isSafeDestination(raw: string, allowedHosts: string[]): URL | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return null;
  return hostAllowed(u.hostname, allowedHosts) ? u : null;
}

export function hasRequiredParams(url: URL, required: string[] | undefined): boolean {
  return (required ?? []).every((p) => (url.searchParams.get(p) ?? "") !== "");
}

/**
 * Monta o link de afiliado a partir da URL do produto. Retorna `null` se o destino não for permitido.
 * Preserva parâmetros já existentes (nunca sobrescreve o identificador do dono).
 */
export function buildAffiliateUrl(productUrl: string, allowedHosts: string[], cfg: AffiliateConfig = {}): string | null {
  const product = isSafeDestination(productUrl, allowedHosts);
  if (!product) return null;
  if (cfg.template) {
    if (!cfg.template.includes("{url}")) return null;
    const built = cfg.template.replace("{url}", encodeURIComponent(product.toString()));
    const u = isSafeDestination(built, allowedHosts);
    return u && hasRequiredParams(u, cfg.requiredParams) ? u.toString() : null;
  }
  for (const [k, v] of Object.entries(cfg.params ?? {})) product.searchParams.set(k, v);
  return hasRequiredParams(product, cfg.requiredParams) ? product.toString() : null;
}

/** Um link de afiliado já pronto (ex.: gerado no portal da loja) só é aceito se o destino for permitido e tiver o que se exige. */
export function acceptProvidedAffiliateUrl(raw: string, allowedHosts: string[], cfg: AffiliateConfig = {}): string | null {
  const u = isSafeDestination(raw, allowedHosts);
  return u && hasRequiredParams(u, cfg.requiredParams) ? u.toString() : null;
}

/** Remove parâmetros de rastreamento de OUTROS (utm_*, gclid…) ao registrar a URL canônica do produto. */
export function stripForeignTracking(raw: string): string {
  const u = new URL(raw);
  for (const k of [...u.searchParams.keys()]) if (/^(utm_|gclid|fbclid|mc_|ref$|aff|matt_|tag$)/i.test(k)) u.searchParams.delete(k);
  u.hash = "";
  return u.toString();
}
