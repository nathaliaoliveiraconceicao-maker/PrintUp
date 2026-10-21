import { fromBlob, type ByteSource } from "./bytes";
import { readGcode } from "./readers/gcode";
import { readThreeMf } from "./readers/threemf";
import { ZipError } from "./safe-zip";
import type { ParseResult } from "./types";
import { validateFileMeta } from "./validate";

/**
 * Ponto de entrada único do importador: valida, identifica o formato pelo CONTEÚDO e delega ao leitor.
 * Nunca lança: todo problema vira `{ status: "rejected" }` com mensagem em pt-BR.
 */
export async function parseModelFile(name: string, source: ByteSource): Promise<ParseResult> {
  const check = validateFileMeta(name, source.size);
  if (!check.ok) return { status: "rejected", code: check.code, message: check.message };

  try {
    if (check.kind === "3mf") {
      const magic = await source.read(0, 4);
      if (!(magic[0] === 0x50 && magic[1] === 0x4b && magic[2] === 0x03 && magic[3] === 0x04)) {
        return { status: "rejected", code: "tipo_invalido", message: "Este arquivo não é um 3MF válido (o conteúdo não corresponde ao formato)." };
      }
      return { status: "ok", model: await readThreeMf(source, name) };
    }

    const head = await source.read(0, Math.min(source.size, 8192));
    if (head[0] === 0x47 && head[1] === 0x43 && head[2] === 0x44 && head[3] === 0x45) {
      return { status: "rejected", code: "bgcode", message: "G-code binário (.bgcode) ainda não é suportado. Exporte como G-code comum (ASCII) ou use o 3MF." };
    }
    if (head.includes(0)) {
      return { status: "rejected", code: "binario", message: "Este arquivo parece binário, não G-code de texto." };
    }
    const headText = new TextDecoder("utf-8").decode(head);
    if (!/^\s*(;|[GMT]\d+)/m.test(headText)) {
      return { status: "rejected", code: "tipo_invalido", message: "O conteúdo não parece G-code." };
    }
    return { status: "ok", model: await readGcode(source, name) };
  } catch (e) {
    if (e instanceof ZipError) {
      return {
        status: "rejected",
        code: e.code === "inseguro" ? "zip_inseguro" : "zip_invalido",
        message: e.code === "inseguro" ? `Arquivo recusado por segurança: ${e.message}` : `Não foi possível ler o arquivo: ${e.message}`,
      };
    }
    return { status: "rejected", code: "falha", message: "Não foi possível ler este arquivo. Use a entrada manual." };
  }
}

export const parseBlob = (file: File) => parseModelFile(file.name, fromBlob(file));
