import { deflateRawSync, deflateSync } from "node:zlib";

/** Montador de ZIP SOMENTE para testes (gera arquivos 3MF sintéticos e variantes maliciosas). */
export interface BuilderEntry {
  name: string;
  data: Uint8Array | string;
  method?: 0 | 8;
  /** Bit 0 das flags: entrada "criptografada" (para testar a recusa). */
  encrypted?: boolean;
  /** Tamanho declarado diferente do real (para testar mentiras no cabeçalho). */
  declaredUncompressed?: number;
  /** Bytes já "compactados" usados como estão (para testar fluxo deflate corrompido). */
  rawCompressed?: Uint8Array;
}

const enc = new TextEncoder();
const u16 = (n: number) => [n & 0xff, (n >> 8) & 0xff];
const u32 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];

export function buildZip(entries: BuilderEntry[], opts: { zip64Marker?: boolean } = {}): Uint8Array {
  const parts: number[][] = [];
  const central: number[][] = [];
  let offset = 0;
  for (const e of entries) {
    const raw = typeof e.data === "string" ? enc.encode(e.data) : e.data;
    const method = e.method ?? 8;
    const data = e.rawCompressed ?? (method === 8 ? new Uint8Array(deflateRawSync(raw)) : raw);
    const name = enc.encode(e.name);
    const flags = e.encrypted ? 1 : 0;
    const usize = e.declaredUncompressed ?? raw.length;
    const local = [...u32(0x04034b50), ...u16(20), ...u16(flags), ...u16(method), ...u16(0), ...u16(0), ...u32(0), ...u32(data.length), ...u32(usize), ...u16(name.length), ...u16(0)];
    parts.push(local, [...name], [...data]);
    central.push([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(flags), ...u16(method), ...u16(0), ...u16(0), ...u32(0),
      ...u32(data.length), ...u32(usize), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...name,
    ]);
    offset += local.length + name.length + data.length;
  }
  const cd = central.flat();
  const eocd = [...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(opts.zip64Marker ? 0xffff : entries.length), ...u16(opts.zip64Marker ? 0xffff : entries.length), ...u32(cd.length), ...u32(offset), ...u16(0)];
  return Uint8Array.from([...parts.flat(), ...cd, ...eocd]);
}

/** PNG mínimo (só a assinatura + bytes: basta para o teste de validação de miniatura). */
export const FAKE_PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1]);

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (b: Uint8Array) => {
  let c = 0xffffffff;
  for (const x of b) c = CRC_TABLE[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const be32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];

function pngChunk(type: string, data: Uint8Array): number[] {
  const body = Uint8Array.from([...enc.encode(type), ...data]);
  return [...be32(data.length), ...body, ...be32(crc32(body))];
}

/**
 * Miniatura PNG VÁLIDA desenhada por código para os exemplos sintéticos: camadas laranja empilhadas sobre o papel
 * e uma faixa diagonal no topo (sinal visual de "exemplo"). Não é uma imagem de nenhum programa.
 */
export function makeSamplePng(size = 96): Uint8Array {
  const paper = [244, 239, 230];
  const orange = [217, 78, 27];
  const rows: number[] = [];
  for (let y = 0; y < size; y++) {
    rows.push(0); // filtro "nenhum"
    for (let x = 0; x < size; x++) {
      let px = paper;
      if (y < 12) px = Math.floor((x + y) / 6) % 2 === 0 ? orange : paper; // faixa diagonal
      const layer = y >= 52 && y < 86 ? Math.floor((y - 52) / 12) : -1; // 3 camadas
      if (layer >= 0) {
        const half = 40 - layer * 9;
        if (Math.abs(x - size / 2) < half && (y - 52) % 12 < 10) px = layer === 0 ? [217, 78, 27] : layer === 1 ? [232, 120, 80] : [243, 165, 130];
      }
      rows.push(...px);
    }
  }
  const ihdr = Uint8Array.from([...be32(size), ...be32(size), 8, 2, 0, 0, 0]);
  return Uint8Array.from([
    ...[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    ...pngChunk("IHDR", ihdr),
    ...pngChunk("IDAT", new Uint8Array(deflateSync(Uint8Array.from(rows)))),
    ...pngChunk("IEND", new Uint8Array(0)),
  ]);
}
