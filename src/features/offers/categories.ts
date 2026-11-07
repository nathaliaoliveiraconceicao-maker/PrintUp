/** Categorias iniciais da central de ofertas. O slug é estável (usado em URLs, alertas e filtros). */
export const OFFER_CATEGORIES = [
  { slug: "filamento-pla", label: "Filamento PLA", group: "filamentos" },
  { slug: "filamento-petg", label: "Filamento PETG", group: "filamentos" },
  { slug: "filamento-abs", label: "Filamento ABS", group: "filamentos" },
  { slug: "filamento-tpu", label: "Filamento TPU", group: "filamentos" },
  { slug: "impressoras", label: "Impressoras 3D", group: "impressoras" },
  { slug: "pecas-reposicao", label: "Peças de reposição", group: "pecas" },
  { slug: "bicos-hotends", label: "Bicos e hotends", group: "pecas" },
  { slug: "mesas-superficies", label: "Mesas e superfícies de impressão", group: "pecas" },
  { slug: "ferramentas", label: "Ferramentas", group: "acessorios" },
  { slug: "secadores", label: "Secadores de filamento", group: "acessorios" },
  { slug: "acessorios", label: "Acessórios", group: "acessorios" },
  { slug: "kits-manutencao", label: "Kits de manutenção", group: "acessorios" },
] as const;

export type OfferCategory = (typeof OFFER_CATEGORIES)[number]["slug"];
export const CATEGORY_SLUGS = OFFER_CATEGORIES.map((c) => c.slug) as readonly OfferCategory[];
export const categoryLabel = (slug: string): string => OFFER_CATEGORIES.find((c) => c.slug === slug)?.label ?? slug;
export const isFilamentCategory = (slug: string): boolean => slug.startsWith("filamento-");
export const isCategory = (v: unknown): v is OfferCategory => typeof v === "string" && (CATEGORY_SLUGS as readonly string[]).includes(v);

/** Palavras-chave por categoria (classificação determinística; a IA, quando houver, só sugere e passa por esta lista). */
const KEYWORDS: [OfferCategory, RegExp][] = [
  ["secadores", /\b(secador|dry\s?box|dryer|estufa)\b/i],
  ["kits-manutencao", /\bkit\b.*\b(manuten|limpeza|reposi|ferrament)/i],
  ["bicos-hotends", /\b(bico|nozzle|hotend|hot\s?end|extrusor)\b/i],
  ["mesas-superficies", /\b(mesa|plataforma|build\s?plate|pei|superf[ií]cie)\b/i],
  ["filamento-petg", /\bpetg\b/i],
  ["filamento-abs", /\babs\b/i],
  ["filamento-tpu", /\b(tpu|tpe|flex[ií]vel)\b/i],
  ["filamento-pla", /\bpla\b/i],
  ["impressoras", /\bimpressora\s*3d\b|\b(ender|bambu\s?lab|prusa|anycubic|elegoo|creality|kobra|neptune|a1 mini|k1)\b.*\b(impressora|3d)\b/i],
  ["pecas-reposicao", /\b(correia|polia|ventoleira|fan|termistor|cartucho aquecedor|motor de passo|eixo|rolamento|tubo ptfe|extrus)\b/i],
  ["ferramentas", /\b(esp[aá]tula|alicate|estilete|paqu[ií]metro|lixa|removedor)\b/i],
];

/** Classifica pelo título. `null` = não é claramente de impressão 3D (não entra na central). */
export function classifyTitle(title: string): OfferCategory | null {
  const t = title.normalize("NFD").replace(/[̀-ͯ]/g, " ");
  for (const [slug, re] of KEYWORDS) if (re.test(title) || re.test(t)) return slug;
  return /\b(3d|impress[aã]o 3d|filamento)\b/i.test(title) ? "acessorios" : null;
}
