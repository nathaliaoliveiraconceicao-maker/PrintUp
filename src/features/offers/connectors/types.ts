/** Contrato dos conectores de loja. Adicionar uma loja = criar um conector e registrá-lo; o núcleo não muda. */
export type RawProduct = {
  externalId: string;
  title: string;
  brand?: string | null;
  model?: string | null;
  imageUrl?: string | null;
  productUrl: string;
  priceCents: number;
  /** Preço "de" informado PELA LOJA (nunca calculado por nós). */
  declaredPreviousCents?: number | null;
  inStock?: boolean | null;
  shippingCents?: number | null;
  /** Link de afiliado já pronto (ex.: gerado no portal da loja). */
  affiliateUrl?: string | null;
  couponCode?: string | null;
  categoryHint?: string | null;
};

export type ConnectorContext = {
  config: Record<string, unknown>;
  env: Record<string, string | undefined>;
  fetch: typeof fetch;
  /** Espera a vez de fazer uma requisição (limite por integração). */
  acquire: () => Promise<void>;
  signal?: AbortSignal;
};

export class ConnectorError extends Error {
  constructor(message: string, readonly kind: "credencial" | "limite" | "rede" | "formato" | "indisponivel", readonly retryable = false) {
    super(message);
  }
}

export interface StoreConnector {
  readonly id: "feed_manual" | "shopee" | "mercadolivre" | "simulado";
  readonly label: string;
  /** Variáveis de ambiente exigidas (só os NOMES; os valores nunca vão ao banco). */
  readonly requiredEnv: readonly string[];
  /** Limite de requisições (por janela) respeitado pelo coletor. */
  readonly rateLimit: { max: number; perMs: number };
  /** Situação conhecida do conector, para exibir ao administrador. */
  readonly status: "pronto" | "preparado_nao_verificado" | "somente_desenvolvimento";
  fetchProducts(ctx: ConnectorContext): Promise<RawProduct[]>;
}

export const envMissing = (c: StoreConnector, env: Record<string, string | undefined>): string[] => c.requiredEnv.filter((k) => !env[k]?.trim());
