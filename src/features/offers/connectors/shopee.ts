import { createHash } from "node:crypto";
import { toCents } from "../pricing";
import { parseReais } from "./feed";
import { ConnectorError, type ConnectorContext, type RawProduct, type StoreConnector } from "./types";

/**
 * Shopee Afiliados (API aberta, GraphQL). ESTADO: PREPARADO, NÃO VERIFICADO.
 * - Exige aprovação no programa de afiliados da Shopee e as credenciais SHOPEE_AFFILIATE_APP_ID / SHOPEE_AFFILIATE_SECRET.
 * - A documentação oficial NÃO pôde ser consultada ao escrever isto: o formato da assinatura, os nomes dos campos e os limites
 *   abaixo seguem o que a comunidade documenta e precisam ser conferidos na documentação da Shopee antes de ativar a fonte.
 * - Nunca usa o desconto "calculado" pela Shopee como preço anterior: preço anterior só vem do nosso histórico observado.
 */
export const SHOPEE_ENDPOINT = "https://open-api.affiliate.shopee.com.br/graphql";

export function shopeeAuthHeader(appId: string, secret: string, payload: string, timestamp: number): string {
  const signature = createHash("sha256").update(`${appId}${timestamp}${payload}${secret}`).digest("hex");
  return `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${signature}`;
}

const QUERY = `query ($keyword: String!, $page: Int!, $limit: Int!) { productOfferV2(keyword: $keyword, page: $page, limit: $limit) { nodes { itemId productName priceMin imageUrl productLink offerLink shopName } pageInfo { hasNextPage } } }`;

type Node = { itemId?: string | number; productName?: string; priceMin?: string | number; imageUrl?: string; productLink?: string; offerLink?: string; shopName?: string };

export function nodeToProduct(n: Node): RawProduct | null {
  const price = parseReais(n.priceMin);
  if (!n.itemId || !n.productName || !n.productLink || price === null || price <= 0) return null;
  return { externalId: String(n.itemId), title: n.productName, imageUrl: n.imageUrl ?? null, productUrl: n.productLink, affiliateUrl: n.offerLink ?? null, priceCents: toCents(price), inStock: null };
}

export const shopeeConnector: StoreConnector = {
  id: "shopee",
  label: "Shopee Afiliados (API aberta)",
  requiredEnv: ["SHOPEE_AFFILIATE_APP_ID", "SHOPEE_AFFILIATE_SECRET"],
  rateLimit: { max: 5, perMs: 1000 },
  status: "preparado_nao_verificado",
  async fetchProducts(ctx: ConnectorContext) {
    const appId = ctx.env.SHOPEE_AFFILIATE_APP_ID;
    const secret = ctx.env.SHOPEE_AFFILIATE_SECRET;
    if (!appId || !secret) throw new ConnectorError("Credenciais da Shopee não configuradas.", "credencial");
    const keywords = Array.isArray(ctx.config.keywords) ? (ctx.config.keywords as unknown[]).filter((k): k is string => typeof k === "string").slice(0, 20) : [];
    if (keywords.length === 0) throw new ConnectorError("Defina as palavras-chave de busca da fonte.", "formato");
    const limit = Math.min(50, Number(ctx.config.limit ?? 20) || 20);
    const out: RawProduct[] = [];
    for (const keyword of keywords) {
      await ctx.acquire();
      const payload = JSON.stringify({ query: QUERY, variables: { keyword, page: 1, limit } });
      let res: Response;
      try {
        res = await ctx.fetch(SHOPEE_ENDPOINT, { method: "POST", headers: { "content-type": "application/json", authorization: shopeeAuthHeader(appId, secret, payload, Math.floor(Date.now() / 1000)) }, body: payload, signal: ctx.signal });
      } catch {
        throw new ConnectorError("Não foi possível falar com a Shopee.", "rede", true);
      }
      if (res.status === 429) throw new ConnectorError("Limite de requisições da Shopee atingido.", "limite", true);
      if (res.status === 401 || res.status === 403) throw new ConnectorError("A Shopee recusou as credenciais.", "credencial");
      if (res.status >= 500) throw new ConnectorError(`A Shopee respondeu ${res.status}.`, "indisponivel", true);
      const body = (await res.json().catch(() => null)) as { errors?: { message?: string; extensions?: { code?: number } }[]; data?: { productOfferV2?: { nodes?: Node[] } } } | null;
      if (body?.errors?.length) {
        const code = body.errors[0].extensions?.code;
        if (code === 10030) throw new ConnectorError("Limite de requisições da Shopee atingido.", "limite", true);
        throw new ConnectorError("A Shopee devolveu um erro para a consulta.", "formato");
      }
      for (const n of body?.data?.productOfferV2?.nodes ?? []) {
        const p = nodeToProduct(n);
        if (p) out.push(p);
      }
    }
    return out;
  },
};
