import type { ByteSource } from "./bytes";
import { ZIP_LIMITS } from "./limits";

/**
 * Leitor ZIP mínimo e defensivo para arquivos 3MF não confiáveis.
 *
 * Princípios:
 *  - Nada é gravado em disco nem executado; só lemos entradas de uma lista permitida.
 *  - Toda leitura tem limite de bytes DESCOMPACTADOS, aplicado durante a descompressão (protege contra ZIP bomb,
 *    mesmo que o tamanho declarado no cabeçalho minta).
 *  - Rejeita: ZIP64, entradas criptografadas, nomes com `..`/caminho absoluto/barra invertida/NUL,
 *    nomes duplicados e diretórios centrais gigantes.
 */

export class ZipError extends Error {
  constructor(
    public readonly code: "invalido" | "inseguro",
    message: string,
  ) {
    super(message);
    this.name = "ZipError";
  }
}

export interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
}

const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

function checkName(name: string) {
  if (
    name.includes("\0") ||
    name.includes("\\") ||
    name.startsWith("/") ||
    /^[A-Za-z]:/.test(name) ||
    name.split("/").some((seg) => seg === "..")
  ) {
    throw new ZipError("inseguro", "O arquivo contém caminhos internos suspeitos.");
  }
}

export async function listZip(src: ByteSource): Promise<ZipEntry[]> {
  if (src.size < 22) throw new ZipError("invalido", "Arquivo ZIP incompleto.");
  const tailLen = Math.min(src.size, 22 + 65535);
  const tail = await src.read(src.size - tailLen, src.size);

  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (u32(tail, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ZipError("invalido", "Não parece um arquivo ZIP/3MF válido.");

  const total = u16(tail, eocd + 10);
  const cdSize = u32(tail, eocd + 12);
  const cdOffset = u32(tail, eocd + 16);
  if (total === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    throw new ZipError("inseguro", "ZIP64 não é suportado.");
  }
  if (total > ZIP_LIMITS.maxEntries) throw new ZipError("inseguro", "O arquivo contém entradas demais.");
  if (cdSize > ZIP_LIMITS.maxCentralDirBytes || cdOffset + cdSize > src.size) {
    throw new ZipError("invalido", "Diretório do ZIP inválido.");
  }

  const cd = await src.read(cdOffset, cdOffset + cdSize);
  const entries: ZipEntry[] = [];
  const seen = new Set<string>();
  let p = 0;
  for (let n = 0; n < total; n++) {
    if (p + 46 > cd.length || u32(cd, p) !== 0x02014b50) throw new ZipError("invalido", "Diretório do ZIP corrompido.");
    const flags = u16(cd, p + 8);
    const method = u16(cd, p + 10);
    const compressedSize = u32(cd, p + 20);
    const uncompressedSize = u32(cd, p + 24);
    const nameLen = u16(cd, p + 28);
    const extraLen = u16(cd, p + 30);
    const commentLen = u16(cd, p + 32);
    const localOffset = u32(cd, p + 42);
    if (p + 46 + nameLen + extraLen + commentLen > cd.length) throw new ZipError("invalido", "Diretório do ZIP corrompido.");
    if (flags & 1) throw new ZipError("inseguro", "O arquivo está protegido por senha.");
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) {
      throw new ZipError("inseguro", "ZIP64 não é suportado.");
    }
    const name = new TextDecoder("utf-8").decode(cd.subarray(p + 46, p + 46 + nameLen));
    checkName(name);
    if (seen.has(name)) throw new ZipError("inseguro", "O arquivo contém entradas duplicadas.");
    seen.add(name);
    entries.push({ name, method, compressedSize, uncompressedSize, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

export interface ReadOptions {
  /** Máximo de bytes descompactados. */
  maxBytes: number;
  /** `true`: devolve só os primeiros `maxBytes` (sem erro). `false`: excedeu => erro. */
  truncate?: boolean;
}

async function inflateRaw(compressed: Uint8Array, { maxBytes, truncate }: ReadOptions): Promise<Uint8Array> {
  const stream = new Blob([compressed as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (total + value.length > maxBytes) {
        if (!truncate) throw new ZipError("inseguro", "Uma entrada do arquivo excede o limite de descompressão.");
        chunks.push(value.subarray(0, maxBytes - total));
        total = maxBytes;
        break;
      }
      chunks.push(value);
      total += value.length;
    }
  } catch (e) {
    if (e instanceof ZipError) throw e;
    throw new ZipError("invalido", "Dados compactados corrompidos.");
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

/** Lê UMA entrada, respeitando o limite de bytes descompactados. */
export async function readEntry(src: ByteSource, entry: ZipEntry, opts: ReadOptions): Promise<Uint8Array> {
  const header = await src.read(entry.localOffset, entry.localOffset + 30);
  if (header.length < 30 || u32(header, 0) !== 0x04034b50) throw new ZipError("invalido", "Entrada do ZIP corrompida.");
  const dataStart = entry.localOffset + 30 + u16(header, 26) + u16(header, 28);
  if (dataStart + entry.compressedSize > src.size) throw new ZipError("invalido", "Entrada do ZIP fora dos limites.");

  if (entry.method === 0) {
    const size = Math.min(entry.compressedSize, opts.maxBytes);
    if (entry.compressedSize > opts.maxBytes && !opts.truncate) {
      throw new ZipError("inseguro", "Uma entrada do arquivo excede o limite de leitura.");
    }
    return src.read(dataStart, dataStart + size);
  }
  if (entry.method === 8) {
    // Só lemos bytes compactados até um teto razoável: quem manda é o limite DESCOMPACTADO.
    const compressedCap = Math.min(entry.compressedSize, Math.max(opts.maxBytes * 2, 64 * 1024));
    if (entry.compressedSize > compressedCap && !opts.truncate) {
      throw new ZipError("inseguro", "Uma entrada do arquivo excede o limite de leitura.");
    }
    return inflateRaw(await src.read(dataStart, dataStart + compressedCap), opts);
  }
  throw new ZipError("invalido", "Método de compressão não suportado.");
}

/** Leitor com orçamento total: soma de bytes descompactados por arquivo importado. */
export class ZipReader {
  private budget: number = ZIP_LIMITS.maxTotalBytes;
  private readonly byName: Map<string, ZipEntry>;

  private constructor(
    private readonly src: ByteSource,
    readonly entries: ZipEntry[],
  ) {
    this.byName = new Map(entries.map((e) => [e.name, e]));
  }

  static async open(src: ByteSource): Promise<ZipReader> {
    return new ZipReader(src, await listZip(src));
  }

  has(name: string): boolean {
    return this.byName.has(name);
  }

  /** Nomes que casam com o padrão, na ordem do arquivo. */
  find(pattern: RegExp): string[] {
    return this.entries.filter((e) => pattern.test(e.name)).map((e) => e.name);
  }

  async read(name: string, opts: ReadOptions): Promise<Uint8Array | null> {
    const entry = this.byName.get(name);
    if (!entry) return null;
    const data = await readEntry(this.src, entry, opts);
    this.budget -= data.length;
    if (this.budget < 0) throw new ZipError("inseguro", "O arquivo excede o limite total de leitura.");
    return data;
  }

  async readText(name: string, opts: ReadOptions): Promise<string | null> {
    const data = await this.read(name, opts);
    return data ? new TextDecoder("utf-8").decode(data) : null;
  }
}
