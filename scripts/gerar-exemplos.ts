/**
 * Gera os arquivos de EXEMPLO SINTÉTICO em public/exemplos/ (npm run exemplos:gerar).
 *
 * São arquivos montados por nós a partir da estrutura conhecida de cada formato. NÃO são exportações reais do
 * MakerWorld, do Bambu Studio, do OrcaSlicer, do PrusaSlicer ou do Cura, e cada um carrega o marcador
 * PRINTUP-SYNTHETIC dentro do próprio conteúdo para que o importador e a interface os identifiquem como exemplos.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  GCODE_BAMBU,
  GCODE_CURA,
  GCODE_ONLY_TIME,
  GCODE_PRUSA,
  bambuModelXml,
  bambuThreeMf,
  geometryOnlyThreeMf,
  prusaProjectThreeMf,
} from "../src/features/imports/testing/fixtures";
import { makeSamplePng } from "../src/features/imports/testing/zip-builder";

const outDir = path.join(process.cwd(), "public", "exemplos");
mkdirSync(outDir, { recursive: true });
const write = (name: string, data: Uint8Array | string) => {
  writeFileSync(path.join(outDir, name), data);
  console.log("gerado:", name);
};

write(
  "exemplo-sintetico-3mf-completo.3mf",
  bambuThreeMf({
    "3D/3dmodel.model": bambuModelXml("", "[EXEMPLO SINTÉTICO] Suporte de celular"),
    "Metadata/plate_1.png": makeSamplePng(),
  }),
);
write("exemplo-sintetico-3mf-sem-fatiamento.3mf", geometryOnlyThreeMf("[EXEMPLO SINTÉTICO] Cubo sem fatiamento"));
write("exemplo-sintetico-3mf-projeto-prusa.3mf", prusaProjectThreeMf("[EXEMPLO SINTÉTICO] Engrenagem"));
write("exemplo-sintetico-gcode-prusa.gcode", GCODE_PRUSA);
write("exemplo-sintetico-gcode-bambu.gcode", GCODE_BAMBU);
write("exemplo-sintetico-gcode-cura-sem-peso.gcode", GCODE_CURA);
write("exemplo-sintetico-gcode-so-tempo.gcode", GCODE_ONLY_TIME);
write("exemplo-sintetico-invalido-nao-e-3mf.3mf", "Este arquivo tem extensão .3mf, mas é só texto. Exemplo SINTÉTICO de arquivo inválido.\n");
write("exemplo-sintetico-invalido-stl.stl", "solid exemplo_sintetico\nendsolid exemplo_sintetico\n");

write(
  "LEIA-ME.txt",
  `ARQUIVOS DE EXEMPLO SINTÉTICOS DO PRINTUP
==========================================

Estes arquivos foram MONTADOS PELO PRINTUP para testar o importador. Eles NÃO são exportações reais do MakerWorld,
do Bambu Studio, do OrcaSlicer, do PrusaSlicer, do Cura nem de qualquer outro programa, e os valores (peso, tempo,
impressora) são inventados só para o teste. Cada arquivo carrega o marcador PRINTUP-SYNTHETIC dentro do conteúdo.

Para validar o importador com arquivos reais, use: npm run validar:arquivo -- caminho/do/arquivo
(veja docs/VALIDACAO-ARQUIVOS-REAIS.md).

Arquivos completos:   3mf-completo, gcode-prusa, gcode-bambu
Arquivos incompletos: 3mf-sem-fatiamento, 3mf-projeto-prusa, gcode-cura-sem-peso, gcode-so-tempo
Arquivos inválidos:   invalido-nao-e-3mf, invalido-stl
`,
);
