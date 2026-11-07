/** Extração determinística de especificações a partir do título (sem IA, sem invenção: o que não aparece fica `undefined`). */
export type Specs = {
  material?: "PLA" | "PETG" | "ABS" | "TPU" | "ASA" | "NYLON";
  variant?: string; // plus, silk, matte, carbon, ...
  weightG?: number; // peso TOTAL de filamento no anúncio (já multiplicado por "2x1kg")
  diameterMm?: 1.75 | 2.85;
  unitCount?: number;
};

const MATERIALS: [Specs["material"], RegExp][] = [
  ["PETG", /\bpetg\b/i],
  ["ABS", /\babs\b/i],
  ["ASA", /\basa\b/i],
  ["TPU", /\b(tpu|tpe)\b/i],
  ["NYLON", /\b(nylon|pa12|pa6)\b/i],
  ["PLA", /\bpla\b/i],
];
const VARIANTS: [string, RegExp][] = [
  ["plus", /\bpla\s?\+|\bplus\b|\bpro\b/i],
  ["silk", /\bsilk\b|\bseda\b/i],
  ["matte", /\bmatte?\b|\bfosco\b/i],
  ["carbon", /\b(carbon|carbono|fibra de carbono|cf)\b/i],
  ["wood", /\b(wood|madeira)\b/i],
  ["glow", /\b(glow|brilha no escuro)\b/i],
  ["pctg", /\bpctg\b/i],
];

const num = (s: string) => Number(s.replace(",", "."));

export function extractWeightG(title: string): number | undefined {
  // "2x1kg", "2 x 500g"
  const multi = /(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(kg|g)\b/i.exec(title);
  if (multi) {
    const each = multi[3].toLowerCase() === "kg" ? num(multi[2]) * 1000 : num(multi[2]);
    const total = Math.round(Number(multi[1]) * each);
    if (total > 0 && total <= 100_000) return total;
  }
  const re = /(\d+(?:[.,]\d+)?)\s*(kg|g)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(title))) {
    const g = m[2].toLowerCase() === "kg" ? Math.round(num(m[1]) * 1000) : Math.round(num(m[1]));
    // pesos plausíveis de bobina: 100 g a 20 kg (evita "0,4mm"/"200g de brinde")
    if (g >= 100 && g <= 20_000) return g;
  }
  return undefined;
}

export function extractSpecs(title: string): Specs {
  const out: Specs = {};
  for (const [mat, re] of MATERIALS) if (re.test(title)) { out.material = mat; break; }
  for (const [name, re] of VARIANTS) if (re.test(title)) { out.variant = name; break; }
  const w = extractWeightG(title);
  if (w !== undefined) out.weightG = w;
  if (/\b1[.,]75\s*mm\b|\b1[.,]75\b/.test(title)) out.diameterMm = 1.75;
  else if (/\b2[.,]85\s*mm\b|\b2[.,]85\b|\b3\s*mm\b/.test(title)) out.diameterMm = 2.85;
  const pack = /\b(?:kit|pack|combo)\s*(?:com|c\/)?\s*(\d+)\b|\b(\d+)\s*(?:un|unid|unidades|rolos|bobinas)\b/i.exec(title);
  const count = pack ? Number(pack[1] ?? pack[2]) : undefined;
  if (count && count > 1 && count <= 50) out.unitCount = count;
  return out;
}
