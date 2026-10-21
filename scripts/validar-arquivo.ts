/**
 * Valida o importador com ARQUIVOS REAIS: npm run validar:arquivo -- caminho/arquivo.3mf [outro.gcode ...]
 * Imprime o relatório de leitura (o que foi reconhecido, o que não foi e a estrutura do arquivo, só nomes).
 * Nada é enviado a lugar nenhum; cole o relatório numa conversa para ajustar os leitores.
 */
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fromBytes } from "../src/features/imports/bytes";
import { parseModelFile } from "../src/features/imports/parse-file";
import { buildReadingReport } from "../src/features/imports/report";

async function main() {
  const files = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  if (files.length === 0) {
    console.log("Uso: npm run validar:arquivo -- caminho/do/arquivo.3mf [outro.gcode ...]");
    process.exit(2);
  }
  let rejected = 0;
  for (const file of files) {
    console.log(`\n${"=".repeat(72)}\n${path.basename(file)}\n${"=".repeat(72)}`);
    let bytes: Uint8Array;
    try {
      if (!statSync(file).isFile()) throw new Error("não é um arquivo");
      bytes = readFileSync(file);
    } catch (e) {
      console.log(`Não foi possível abrir: ${(e as Error).message}`);
      rejected++;
      continue;
    }
    const result = await parseModelFile(path.basename(file), fromBytes(bytes));
    if (result.status === "rejected") {
      rejected++;
      console.log(`RECUSADO (${result.code}): ${result.message}`);
      continue;
    }
    console.log(buildReadingReport(result.model, { name: path.basename(file), size: bytes.length }));
  }
  process.exit(rejected > 0 ? 1 : 0);
}

void main();
