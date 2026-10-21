import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { formatBRL } from "@/lib/utils";
import { formatDateBR, formatQuoteNumber } from "./status";

/**
 * Dados do PDF do cliente. De propósito, este tipo NÃO tem custo de produção, margem nem lucro:
 * o que não está aqui não tem como aparecer no documento.
 */
export interface QuotePdfData {
  number: number;
  issueDate: string;
  validUntil: string;
  productionDays: number | null;
  business: {
    name: string | null;
    contactName: string | null;
    phone: string | null;
    email: string | null;
    city: string | null;
    brandColor: string;
    logo: Uint8Array | null;
  };
  customer: { name: string; phone: string | null; email: string | null; document: string | null };
  items: {
    name: string;
    description: string | null;
    quantity: number;
    unitPrice: number;
    discountPercent: number;
    lineTotal: number;
    photo: Uint8Array | null;
  }[];
  subtotal: number;
  discountLabel: string | null;
  discountTotal: number;
  total: number;
  paymentTerms: string | null;
  notes: string | null;
}

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const M = 44;
const INK = rgb(0.13, 0.11, 0.1);
const MUTED = rgb(0.45, 0.42, 0.4);
const LINE = rgb(0.86, 0.83, 0.8);

function hexToRgb(hex: string) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return rgb(0.85, 0.31, 0.11);
  return rgb(parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255);
}

/** Mantém só os caracteres que a fonte padrão (WinAnsi) sabe desenhar; o resto vira "?". */
function clean(font: PDFFont, text: string): string {
  const set = new Set(font.getCharacterSet());
  return [...text.replace(/[\r\t]/g, " ")].map((ch) => (ch === "\n" || set.has(ch.codePointAt(0)!) ? ch : "?")).join("");
}

function wrap(font: PDFFont, size: number, text: string, width: number): string[] {
  const out: string[] = [];
  for (const para of clean(font, text).split("\n")) {
    let line = "";
    for (const word of para.split(" ")) {
      let w = word;
      // palavra maior que a linha: quebra por caractere
      while (font.widthOfTextAtSize(w, size) > width) {
        let cut = w.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(w.slice(0, cut), size) > width) cut--;
        if (line) { out.push(line); line = ""; }
        out.push(w.slice(0, cut));
        w = w.slice(cut);
      }
      const next = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(next, size) <= width) line = next;
      else { out.push(line); line = w; }
    }
    out.push(line);
  }
  return out;
}

async function embed(doc: PDFDocument, bytes: Uint8Array | null): Promise<PDFImage | null> {
  if (!bytes) return null;
  try {
    return bytes[0] === 0x89 ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  } catch {
    return null; // imagem ilegível: o orçamento sai sem ela
  }
}

export async function buildQuotePdf(d: QuotePdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Orçamento ${formatQuoteNumber(d.number)}`);
  doc.setProducer("PrintUp");
  doc.setCreator("PrintUp");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const brand = hexToRgb(d.business.brandColor);
  const logo = await embed(doc, d.business.logo);

  let page: PDFPage = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - M;

  const text = (t: string, x: number, yy: number, o: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; right?: number } = {}) => {
    const f = o.bold ? bold : font;
    const size = o.size ?? 10;
    const s = clean(f, t).replace(/\n/g, " ");
    const px = o.right !== undefined ? o.right - f.widthOfTextAtSize(s, size) : x;
    page.drawText(s, { x: px, y: yy, size, font: f, color: o.color ?? INK });
  };
  const ensure = (h: number) => {
    if (y - h < M + 30) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - M;
    }
  };

  // ── Cabeçalho: identidade do vendedor ──
  page.drawRectangle({ x: 0, y: PAGE_H - 10, width: PAGE_W, height: 10, color: brand });
  y = PAGE_H - 44;
  let textX = M;
  if (logo) {
    const s = Math.min(54 / logo.height, 140 / logo.width);
    page.drawImage(logo, { x: M, y: y - logo.height * s + 10, width: logo.width * s, height: logo.height * s });
    textX = M + logo.width * s + 14;
  }
  text(d.business.name || "Orçamento", textX, y, { size: 17, bold: true });
  const contact = [d.business.contactName, d.business.phone, d.business.email, d.business.city].filter(Boolean).join(" · ");
  if (contact) text(contact, textX, y - 16, { size: 9, color: MUTED });

  text("ORÇAMENTO", 0, y, { size: 9, bold: true, color: brand, right: PAGE_W - M });
  text(formatQuoteNumber(d.number), 0, y - 18, { size: 18, bold: true, right: PAGE_W - M });
  y -= 62;
  page.drawLine({ start: { x: M, y }, end: { x: PAGE_W - M, y }, thickness: 0.8, color: LINE });
  y -= 22;

  // ── Datas e prazos ──
  const meta: [string, string][] = [
    ["Emissão", formatDateBR(d.issueDate)],
    ["Válido até", formatDateBR(d.validUntil)],
  ];
  if (d.productionDays !== null) meta.push(["Prazo de produção", d.productionDays === 0 ? "Imediato" : `${d.productionDays} dia${d.productionDays === 1 ? "" : "s"}`]);
  let mx = M;
  for (const [k, v] of meta) {
    text(k.toUpperCase(), mx, y, { size: 7.5, bold: true, color: MUTED });
    text(v, mx, y - 13, { size: 11, bold: true });
    mx += 150;
  }
  y -= 44;

  // ── Cliente ──
  text("CLIENTE", M, y, { size: 7.5, bold: true, color: MUTED });
  text(d.customer.name, M, y - 14, { size: 12, bold: true });
  const cust = [d.customer.document, d.customer.phone, d.customer.email].filter(Boolean).join(" · ");
  if (cust) text(cust, M, y - 28, { size: 9, color: MUTED });
  y -= cust ? 52 : 38;

  // ── Itens ──
  const colQty = 330, colUnit = 395, colDisc = 462, colTotal = PAGE_W - M;
  const header = () => {
    page.drawRectangle({ x: M, y: y - 6, width: PAGE_W - 2 * M, height: 22, color: brand });
    const w = rgb(1, 1, 1);
    text("Item", M + 8, y, { size: 9, bold: true, color: w });
    text("Qtd", 0, y, { size: 9, bold: true, color: w, right: colQty + 20 });
    text("Unitário", 0, y, { size: 9, bold: true, color: w, right: colUnit + 40 });
    text("Desc.", 0, y, { size: 9, bold: true, color: w, right: colDisc + 30 });
    text("Total", 0, y, { size: 9, bold: true, color: w, right: colTotal - 8 });
    y -= 8; // topo da primeira linha, logo abaixo da faixa do cabeçalho
  };
  ensure(60);
  header();

  for (const it of d.items) {
    const nameLines = wrap(bold, 10, it.name, colQty - M - 64);
    const descLines = it.description ? wrap(font, 8.5, it.description, colQty - M - 64) : [];
    const photo = await embed(doc, it.photo);
    const h = Math.max(nameLines.length * 12 + descLines.length * 10.5 + 12, photo ? 50 : 0, 28);
    if (y - h < M + 30) {
      ensure(h + 40);
      header();
    }
    const top = y;
    const base = top - 14; // linha de base do texto
    const left = photo ? M + 52 : M + 8;
    if (photo) {
      const s = Math.min(40 / photo.width, 40 / photo.height);
      page.drawImage(photo, { x: M + 6, y: top - 4 - photo.height * s, width: photo.width * s, height: photo.height * s });
    }
    let ty = base;
    for (const l of nameLines) { text(l, left, ty, { size: 10, bold: true }); ty -= 12; }
    for (const l of descLines) { text(l, left, ty, { size: 8.5, color: MUTED }); ty -= 10.5; }
    text(String(it.quantity), 0, base, { right: colQty + 20 });
    text(formatBRL(it.unitPrice), 0, base, { right: colUnit + 40 });
    text(it.discountPercent > 0 ? `${String(it.discountPercent).replace(".", ",")}%` : "—", 0, base, { right: colDisc + 30, color: it.discountPercent > 0 ? INK : MUTED });
    text(formatBRL(it.lineTotal), 0, base, { right: colTotal - 8, bold: true });
    y = top - h;
    page.drawLine({ start: { x: M, y }, end: { x: PAGE_W - M, y }, thickness: 0.5, color: LINE });
  }

  // ── Totais ──
  ensure(90);
  y -= 12;
  const row = (label: string, value: string, strong = false) => {
    text(label, 0, y, { size: strong ? 12 : 10, bold: strong, right: colTotal - 110 });
    text(value, 0, y, { size: strong ? 14 : 10, bold: strong, right: colTotal - 8, color: strong ? brand : INK });
    y -= strong ? 24 : 16;
  };
  row("Subtotal", formatBRL(d.subtotal));
  if (d.discountTotal > 0) row(d.discountLabel ?? "Desconto", `- ${formatBRL(d.discountTotal)}`);
  y -= 2;
  page.drawLine({ start: { x: colTotal - 220, y: y + 12 }, end: { x: colTotal, y: y + 12 }, thickness: 0.8, color: LINE });
  row("Total", formatBRL(d.total), true);

  // ── Condições ──
  const block = (title: string, body: string | null) => {
    if (!body?.trim()) return;
    const lines = wrap(font, 9.5, body, PAGE_W - 2 * M);
    ensure(24 + lines.length * 12);
    y -= 8;
    text(title.toUpperCase(), M, y, { size: 7.5, bold: true, color: MUTED });
    y -= 14;
    for (const l of lines) { text(l, M, y, { size: 9.5 }); y -= 12; }
  };
  block("Condições de pagamento", d.paymentTerms);
  block("Observações", d.notes);

  // ── Rodapé em todas as páginas ──
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const note = `Orçamento ${formatQuoteNumber(d.number)} · válido até ${formatDateBR(d.validUntil)}${pages.length > 1 ? ` · página ${i + 1} de ${pages.length}` : ""}`;
    p.drawText(clean(font, note), { x: M, y: 24, size: 8, font, color: MUTED });
  });

  return doc.save();
}
