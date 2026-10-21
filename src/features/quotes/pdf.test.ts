import { inflateSync } from "node:zlib";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildQuotePdf, type QuotePdfData } from "./pdf";

/** Extrai o texto desenhado: descomprime os fluxos de conteúdo; as fontes padrão saem como strings hexadecimais (WinAnsi) antes de `Tj`. */
function textOf(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes);
  const out: string[] = [];
  let at = 0;
  for (;;) {
    const start = raw.indexOf("stream", at, "latin1");
    if (start < 0) break;
    const end = raw.indexOf("endstream", start, "latin1");
    if (end < 0) break;
    at = end + 9;
    const body = raw.subarray(start + 6, end);
    let content: string;
    try {
      content = inflateSync(body.subarray(body[0] === 0x0d ? 2 : 1)).toString("latin1");
    } catch {
      continue; // fluxo que não é de conteúdo (imagem, fonte)
    }
    for (const m of content.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) out.push(Buffer.from(m[1], "hex").toString("latin1"));
  }
  return out.join("\n");
}

const data = (over: Partial<QuotePdfData> = {}): QuotePdfData => ({
  number: 12,
  issueDate: "2026-01-10",
  validUntil: "2026-01-20",
  productionDays: 5,
  business: { name: "Oficina Aurora", contactName: "Nathalia", phone: "(11) 99999-0000", email: "oi@aurora.com", city: "São Paulo", brandColor: "#d94e1b", logo: null },
  customer: { name: "Ana Souza", phone: "(11) 98888-0000", email: null, document: null },
  items: [
    { name: "Vaso Voronoi", description: "PLA branco, 15 cm", quantity: 2, unitPrice: 40, discountPercent: 0, lineTotal: 80, photo: null },
    { name: "Nome gravado", description: null, quantity: 1, unitPrice: 25, discountPercent: 10, lineTotal: 22.5, photo: null },
  ],
  subtotal: 102.5,
  discountLabel: "Desconto (10%)",
  discountTotal: 10.25,
  total: 92.25,
  paymentTerms: "50% na aprovação e 50% na entrega. Pix.",
  notes: "Cor sujeita à disponibilidade.",
  ...over,
});

describe("buildQuotePdf", () => {
  it("gera um PDF válido de 1 página com os dados do orçamento", async () => {
    const bytes = await buildQuotePdf(data());
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    const t = textOf(bytes);
    for (const s of ["Oficina Aurora", "#0012", "Ana Souza", "Vaso Voronoi", "Nome gravado", "10/01/2026", "20/01/2026", "5 dias", "50% na aprovação", "Cor sujeita"]) {
      expect(t).toContain(s);
    }
    expect(t.replace(/\u00a0/g, " ")).toContain("R$ 92,25");
    expect(t.replace(/\u00a0/g, " ")).toContain("R$ 102,50");
  });

  it("não contém custo interno, margem nem lucro", async () => {
    const t = textOf(await buildQuotePdf(data())).toLowerCase();
    expect(t).not.toMatch(/custo|margem|lucro|markup|produção:/);
  });

  it("muitos itens e textos longos paginam sem perder linhas", async () => {
    const items = Array.from({ length: 40 }, (_, i) => ({
      name: `Peça número ${i + 1} com um nome bem comprido para forçar a quebra de linha na coluna`,
      description: "Descrição extensa ".repeat(12),
      quantity: 1, unitPrice: 10, discountPercent: 0, lineTotal: 10, photo: null,
    }));
    const bytes = await buildQuotePdf(data({ items, subtotal: 400, discountTotal: 0, discountLabel: null, total: 400 }));
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(1);
    const t = textOf(bytes);
    expect(t).toContain("Peça número 1 ");
    expect(t).toContain("Peça número 40 ");
    expect(t).toContain("página 1 de");
  });

  it("caracteres fora do alfabeto da fonte não derrubam a geração", async () => {
    const bytes = await buildQuotePdf(data({ notes: "Ótimo! 😀 日本語 — “aspas” ç ã" }));
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
  });

  it("imagem corrompida é ignorada, o orçamento sai igual", async () => {
    const bytes = await buildQuotePdf(data({ business: { ...data().business, logo: Uint8Array.from([0x89, 1, 2, 3]) } }));
    expect(textOf(bytes)).toContain("Oficina Aurora");
  });

  it("logo PNG válido é embutido", async () => {
    // PNG 1x1 vermelho
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64");
    const withLogo = await buildQuotePdf(data({ business: { ...data().business, logo: new Uint8Array(png) } }));
    const without = await buildQuotePdf(data());
    expect(withLogo.length).toBeGreaterThan(without.length);
  });
});
