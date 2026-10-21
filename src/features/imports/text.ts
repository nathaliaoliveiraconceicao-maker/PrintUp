/** Utilitários de texto para metadados vindos de arquivos NÃO confiáveis. Nada aqui interpreta ou executa conteúdo. */

const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g;

/** Remove caracteres de controle, normaliza espaços e limita o tamanho. Vazio => null. */
export function cleanText(value: unknown, max = 120): string | null {
  if (typeof value !== "string") return null;
  const s = value.replace(CONTROL_CHARS, " ").replace(/\s+/g, " ").trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max).trimEnd() : s;
}

/** Número decimal simples ("12", "12.5"). Qualquer outra coisa => null. */
export function parseNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const s = value.trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** "1d 2h 3m 4s" => minutos (2 casas). Sem nenhuma unidade reconhecida ou resultado <= 0 => null. */
export function parseDurationToMinutes(value: string): number | null {
  const re = /(\d+(?:\.\d+)?)\s*([dhms])\b/gi;
  let seconds = 0;
  let found = false;
  for (const m of value.matchAll(re)) {
    found = true;
    const n = Number(m[1]);
    const unit = m[2].toLowerCase();
    seconds += unit === "d" ? n * 86400 : unit === "h" ? n * 3600 : unit === "m" ? n * 60 : n;
  }
  if (!found || !Number.isFinite(seconds) || seconds <= 0) return null;
  return round2(seconds / 60);
}

export function decodeXmlEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, d: string) => (Number(d) < 0x110000 ? String.fromCodePoint(Number(d)) : ""))
    .replace(/&amp;/g, "&");
}

const ATTR_RE = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

/** Atributos de todas as tags `<name ...>` / `<name .../>` (varredura simples; não resolve entidades externas). */
export function xmlTags(xml: string, name: string): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  const re = new RegExp(`<${name}(\\s[^>]*?)?\\/?>`, "g");
  for (const m of xml.matchAll(re)) {
    const attrs: Record<string, string> = {};
    for (const a of (m[1] ?? "").matchAll(ATTR_RE)) attrs[a[1]] = decodeXmlEntities(a[2] ?? a[3] ?? "");
    out.push(attrs);
  }
  return out;
}

/** Conteúdo interno (bruto) de cada bloco `<name ...>...</name>`. */
export function xmlBlocks(xml: string, name: string): string[] {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "g");
  return [...xml.matchAll(re)].map((m) => m[1]);
}

/** `<metadata key="k" value="v"/>` => { k: v } (usado pelo Bambu/Orca). */
export function xmlKeyValueMetadata(xml: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of xmlTags(xml, "metadata")) if (typeof t.key === "string" && "value" in t && !(t.key in out)) out[t.key] = t.value;
  return out;
}

/** `<metadata name="Title">Valor</metadata>` => { Title: Valor } (usado em 3D/3dmodel.model). */
export function xmlNamedMetadata(xml: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of xml.matchAll(/<metadata\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/metadata>/g)) {
    if (!(m[1] in out)) out[m[1]] = decodeXmlEntities(m[2].trim());
  }
  return out;
}

/** Linhas `; chave = valor` / `; chave: valor` de comentários de G-code ou de arquivos de configuração. */
export function parseCommentConfig(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const raw of text.split(/\r?\n/)) {
    if (raw.length > 4000 || raw[0] !== ";") continue;
    const m = /^;\s*([A-Za-z0-9_.\[\]() %/-]+?)\s*[:=]\s*(.*?)\s*$/.exec(raw);
    if (!m) continue;
    const key = m[1].toLowerCase();
    if (!map.has(key)) map.set(key, m[2]);
  }
  return map;
}

/** Divide listas como `PLA;PLA` ou `"#fff";"#000"` ou `0.4,0.4`. */
export function splitList(value: string): string[] {
  return value
    .split(/[;,]/)
    .map((s) => s.trim().replace(/^"(.*)"$/, "$1").trim())
    .filter((s) => s.length > 0);
}

export const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
export function isPng(bytes: Uint8Array): boolean {
  return bytes.length > 8 && PNG_SIGNATURE.every((b, i) => bytes[i] === b);
}
