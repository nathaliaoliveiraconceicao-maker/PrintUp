import { toCents } from "../pricing";
import { ConnectorError, type ConnectorContext, type RawProduct, type StoreConnector } from "./types";

/**
 * Mercado Livre. ESTADO: PREPARADO, NÃO VERIFICADO.
 * - Não existe (até onde pudemos apurar) uma API pública para GERAR links de afiliado: eles são criados no portal de afiliados.
 *   Por isso este conector NÃO inventa links: o link de afiliado vem de `config.affiliateLinks[itemId]` (colado do portal) ou do
 *   modelo definido em Lojas → parâmetros de afiliado. Sem isso, a oferta sai como link comum e vai para revisão.
 * - Dados do item: consulta aos anúncios por ID (`config.itemIds`), com token opcional (ML_ACCESS_TOKEN). As regras de acesso da
 *   API de itens precisam ser conferidas nos termos do Mercado Livre antes de ativar a fonte.
 */
type Item = { id?: string; title?: string; price?: number; original_price?: number | null; permalink?: string; thumbnail?: string; available_quantity?: number; status?: string; shipping?: { free_shipping?: boolean } };

export function itemToProduct(it: Item, affiliateUrl: string | null): RawProduct | null {
  if (!it.id || !it.title || !it.permalink || typeof it.price !== "number" || it.price <= 0) return null;
  return {
    externalId: it.id,
    title: it.title,
    imageUrl: it.thumbnail?.replace(/^http:/, "https:") ?? null,
    productUrl: it.permalink,
    priceCents: toCents(it.price),
    declaredPreviousCents: typeof it.original_price === "number" && it.original_price > it.price ? toCents(it.original_price) : null,
    inStock: typeof it.available_quantity === "number" ? it.available_quantity > 0 && it.status !== "paused" : null,
    shippingCents: it.shipping?.free_shipping ? 0 : null,
    affiliateUrl,
  };
}

export const mercadoLivreConnector: StoreConnector = {
  id: "mercadolivre",
  label: "Mercado Livre (dados dos anúncios + link do portal de afiliados)",
  requiredEnv: [],
  rateLimit: { max: 3, perMs: 1000 },
  status: "preparado_nao_verificado",
  async fetchProducts(ctx: ConnectorContext) {
    const ids = Array.isArray(ctx.config.itemIds) ? (ctx.config.itemIds as unknown[]).filter((k): k is string => typeof k === "string" && /^MLB\d{5,15}$/.test(k)).slice(0, 100) : [];
    if (ids.length === 0) throw new ConnectorError("Informe os códigos dos anúncios (MLB…) desta fonte.", "formato");
    const links = (typeof ctx.config.affiliateLinks === "object" && ctx.config.affiliateLinks ? ctx.config.affiliateLinks : {}) as Record<string, string>;
    const token = ctx.env.ML_ACCESS_TOKEN;
    const out: RawProduct[] = [];
    for (let i = 0; i < ids.length; i += 20) {
      await ctx.acquire();
      const batch = ids.slice(i, i + 20);
      let res: Response;
      try {
        res = await ctx.fetch(`https://api.mercadolibre.com/items?ids=${batch.join(",")}`, { headers: token ? { authorization: `Bearer ${token}` } : {}, signal: ctx.signal });
      } catch {
        throw new ConnectorError("Não foi possível falar com o Mercado Livre.", "rede", true);
      }
      if (res.status === 429) throw new ConnectorError("Limite de requisições do Mercado Livre atingido.", "limite", true);
      if (res.status === 401 || res.status === 403) throw new ConnectorError("O Mercado Livre recusou o acesso à API de anúncios.", "credencial");
      if (res.status >= 500) throw new ConnectorError(`O Mercado Livre respondeu ${res.status}.`, "indisponivel", true);
      if (!res.ok) throw new ConnectorError(`O Mercado Livre respondeu ${res.status}.`, "indisponivel");
      const rows = (await res.json().catch(() => null)) as { code?: number; body?: Item }[] | null;
      if (!Array.isArray(rows)) throw new ConnectorError("Resposta inesperada do Mercado Livre.", "formato");
      for (const r of rows) {
        if (r.code !== 200 || !r.body?.id) continue;
        const p = itemToProduct(r.body, typeof links[r.body.id] === "string" ? links[r.body.id] : null);
        if (p) out.push(p);
      }
    }
    return out;
  },
};
