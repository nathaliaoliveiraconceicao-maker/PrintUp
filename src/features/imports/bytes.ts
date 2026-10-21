/** Fonte de bytes com leitura por intervalo: funciona com `File`/`Blob` (navegador) e com `Uint8Array` (testes). */
export interface ByteSource {
  readonly size: number;
  read(start: number, end: number): Promise<Uint8Array>;
}

export function fromBlob(blob: Blob): ByteSource {
  return {
    size: blob.size,
    async read(start, end) {
      return new Uint8Array(await blob.slice(start, end).arrayBuffer());
    },
  };
}

export function fromBytes(bytes: Uint8Array): ByteSource {
  return {
    size: bytes.byteLength,
    async read(start, end) {
      return bytes.slice(start, end);
    },
  };
}
