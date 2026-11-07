import { toCents } from "../pricing";
import { ConnectorError, type ConnectorContext, type RawProduct, type StoreConnector } from "./types";

/** Interpreta um valor em reais digitado/exportado (1.234,56 | 1234.56 | 1234,56). */
export function parseReais(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const s = v.replace(/[^\d.,-]/g, "");
  if (!s) return null;
  const n = s.includes(",") ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s);
  return Number.isFinite(n) ? n : null;
}

const str = (v: unknown, max = 300): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const bool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : typeof v === "string" ? (/^(sim|true|1|s)$/i.test(v) ? true : /^(nao|não|false|0|n)$/i.test(v) ? false : null) : null);

const FIELD_ALIASES: Record<string, string[]> = {
  externalId: ["id", "externalid", "sku", "codigo", "código", "item_id"],
  title: ["titulo", "título", "nome", "title", "name"],
  brand: ["marca", "brand"],
  model: ["modelo", "model"],
  imageUrl: ["imagem", "image", "image_url", "foto"],
  productUrl: ["url", "link", "link_produto", "product_url"],
  price: ["preco", "preço", "price", "valor"],
  previous: ["preco_de", "preço_de", "preco_anterior", "preço_anterior", "previous_price", "original_price"],
  inStock: ["estoque", "disponivel", "disponível", "in_stock", "available"],
  shipping: ["frete", "shipping"],
  affiliateUrl: ["link_afiliado", "affiliate_url", "afiliado"],
  coupon: ["cupom", "coupon"],
  category: ["categoria", "category"],
};
const pick = (row: Record<string, unknown>, key: keyof typeof FIELD_ALIASES): unknown => {
  for (const [k, v] of Object.entries(row)) if (FIELD_ALIASES[key].includes(k.toLowerCase().trim())) return v;
  return undefined;
};

export function rowToProduct(row: Record<string, unknown>): RawProduct | { error: string } {
  const title = str(pick(row, "title"));
  const url = str(pick(row, "productUrl"), 1000);
  const price = parseReais(pick(row, "price"));
  if (!title) return { error: "sem_titulo" };
  if (!url) return { error: "sem_url" };
  if (price === null || price <= 0) return { error: "preco_invalido" };
  const prev = parseReais(pick(row, "previous"));
  const ship = parseReais(pick(row, "shipping"));
  return {
    externalId: str(pick(row, "externalId"), 120) ?? url,
    title,
    brand: str(pick(row, "brand"), 80),
    model: str(pick(row, "model"), 120),
    imageUrl: str(pick(row, "imageUrl"), 1000),
    productUrl: url,
    priceCents: toCents(price),
    declaredPreviousCents: prev !== null && prev > 0 ? toCents(prev) : null,
    inStock: bool(pick(row, "inStock")),
    shippingCents: ship !== null && ship >= 0 ? toCents(ship) : null,
    affiliateUrl: str(pick(row, "affiliateUrl"), 1500),
    couponCode: str(pick(row, "coupon"), 32)?.toUpperCase() ?? null,
    categoryHint: str(pick(row, "category"), 40),
  };
}

/** CSV simples (separador ; ou ,), com aspas. Sem dependências. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  const sep = (text.split("\n", 1)[0].match(/;/g)?.length ?? 0) >= (text.split("\n", 1)[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  let cur: string[] = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (c === '"') q = false; else field += c; }
    else if (c === '"') q = true;
    else if (c === sep) { cur.push(field); field = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; cur.push(field); field = ""; if (cur.some((x) => x.trim())) rows.push(cur); cur = []; }
    else field += c;
  }
  cur.push(field); if (cur.some((x) => x.trim())) rows.push(cur);
  const [head, ...body] = rows;
  if (!head) return [];
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

export type ParsedFeed = { products: RawProduct[]; rejected: { line: number; reason: string }[] };

export function parseFeedText(text: string, maxItems = 2000): ParsedFeed {
  const trimmed = text.trim();
  let rows: Record<string, unknown>[];
  try {
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      const j = JSON.parse(trimmed) as unknown;
      const arr = Array.isArray(j) ? j : Array.isArray((j as { products?: unknown }).products) ? (j as { products: unknown[] }).products : null;
      if (!arr) throw new Error("formato");
      rows = arr.filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null);
    } else rows = parseCsv(trimmed);
  } catch {
    throw new ConnectorError("O arquivo não é um JSON ou CSV válido.", "formato");
  }
  const products: RawProduct[] = [];
  const rejected: ParsedFeed["rejected"] = [];
  rows.slice(0, maxItems).forEach((r, i) => {
    const p = rowToProduct(r);
    if ("error" in p) rejected.push({ line: i + 1, reason: p.error });
    else products.push(p);
  });
  return { products, rejected };
}

/** Feed autorizado: arquivo JSON/CSV em um endereço https que o parceiro/loja disponibiliza (`config.feedUrl`). */
export const feedConnector: StoreConnector = {
  id: "feed_manual",
  label: "Feed autorizado (JSON/CSV) ou importação manual",
  requiredEnv: [],
  rateLimit: { max: 2, perMs: 1000 },
  status: "pronto",
  async fetchProducts(ctx: ConnectorContext) {
    const url = typeof ctx.config.feedUrl === "string" ? ctx.config.feedUrl : "";
    if (!/^https:\/\//.test(url)) throw new ConnectorError("Esta fonte não tem um endereço de feed (https) configurado.", "formato");
    await ctx.acquire();
    let res: Response;
    try {
      res = await ctx.fetch(url, { headers: { accept: "application/json, text/csv, text/plain" }, signal: ctx.signal });
    } catch {
      throw new ConnectorError("Não foi possível baixar o feed.", "rede", true);
    }
    if (res.status === 429 || res.status >= 500) throw new ConnectorError(`O feed respondeu ${res.status}.`, res.status === 429 ? "limite" : "indisponivel", true);
    if (!res.ok) throw new ConnectorError(`O feed respondeu ${res.status}.`, "indisponivel");
    const text = await res.text();
    if (text.length > 5_000_000) throw new ConnectorError("O feed é grande demais (limite de 5 MB).", "formato");
    return parseFeedText(text).products;
  },
};
