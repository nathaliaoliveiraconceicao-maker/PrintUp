# Importador de modelos 3D — como funciona, o que foi testado e limitações

Código em `src/features/imports/`. A leitura do arquivo acontece **no navegador** (nada é enviado ao servidor para ser lido).

## Fluxo
1. Tela **Importar modelo** (`/importar`): arquivo 3MF · arquivo G-code · informar manualmente · link do MakerWorld (**preparado, desabilitado: "em breve"**).
2. O arquivo é validado (extensão, tamanho, conteúdo), lido por um leitor específico do formato e mostrado numa **ficha editável**.
3. **Calcular preço** salva o modelo/perfil e abre a calculadora já preenchida (tempo, peso, material, impressora). Cada valor mostra a origem: *do arquivo*, *editado*, *informado por você* ou *em branco*.
4. Em **Salvar este preço**, o produto nasce com o nome do modelo, a miniatura e o vínculo ao modelo; o histórico do preço registra a origem dos dados.

## Leitores (interface única `ParseResult`)
| Leitor | Arquivo | Onde procura |
|---|---|---|
| `readThreeMf` | `.3mf` (ZIP) | `Metadata/slice_info.config` (Bambu/Orca: placas, `prediction` em s, `weight`, `<filament>`, `<object>`), `Metadata/project_settings.config` (JSON: impressora, material, camada), `Metadata/model_settings.config` (placas/nomes), `Metadata/Slic3r_PE.config` (PrusaSlicer), `3D/3dmodel.model` (só o começo: Title, Designer, Application), miniatura `Metadata/plate_N.png` / `thumbnail.png` |
| `readGcode` | `.gcode`/`.gco` (ASCII) | só **começo (256 KB) e fim (512 KB)**: comentários `; chave = valor` e `; chave: valor` (PrusaSlicer/Orca, cabeçalho do Bambu Studio, `;TIME:` do Cura) |

## Dados extraídos automaticamente (quando o arquivo traz)
Nome do modelo · autor · programa e versão · impressora (modelo ou código do fabricante) · bico e altura de camada · material (por filamento) · peso (g) · tempo (min) · quantidade de peças por placa · número de placas · suportes · desperdício (torre de limpeza, só se o arquivo informar) · miniatura PNG.

**Nunca é inventado:** o que não vem no arquivo fica em branco (`null`) e é listado em "O que não encontramos no arquivo". Não há estimativa por densidade, volume ou média. O banco impõe a regra: peso/tempo presentes **exigem** origem; ausentes **não podem** ter origem.

## Segurança
- Extensão permitida: `.3mf`, `.gcode`, `.gco`. **STL** e **.bgcode** são recusados com orientação. O conteúdo é conferido (3MF começa com `PK`; G-code não pode ter bytes nulos).
- Tamanho máximo **50 MB** (recusado antes de ler qualquer byte). Limite também no bucket.
- ZIP: nada é gravado em disco nem executado; só entradas de uma **lista permitida** são lidas; descompressão com **limite de bytes aplicado durante a leitura** (protege de ZIP bomb mesmo se o cabeçalho mentir), máx. 2 MB por arquivo de texto, 256 KB do modelo, 2 MB por imagem e 16 MB no total; recusa ZIP64, entradas com senha, nomes duplicados e caminhos suspeitos (`..`, `/`, `\`); máx. 5.000 entradas.
- Textos importados são limpos (controles removidos, tamanho limitado) e exibidos como texto; XML não resolve entidades externas (sem XXE).
- Servidor: tudo é **revalidado com Zod**; caminhos de arquivo precisam ser `<seu id>/…` com nome gerado por nós; o servidor confere no Storage que o objeto existe e o tamanho real; falha ⇒ remove o que foi enviado.
- **Não guardamos o arquivo original por padrão**: só dados e miniatura. O original só é guardado se o usuário marcar a opção.
- Bucket `model-files` **privado**, uma pasta por usuário (RLS), links assinados de 1 hora.
- **Limite de armazenamento por plano**: policy no banco bloqueia novos envios ao atingir `plans.limits.max_storage_mb` (trial 50 · starter 300 · pro 1000, **valores provisórios**). É um teto "flexível": o envio que cruza o limite é aceito, o seguinte é bloqueado.

## Arquivos de exemplo SINTÉTICOS (para testar sem arquivo real)
Em `public/exemplos/` (gerados por `npm run exemplos:gerar`, a partir do mesmo código dos testes) e disponíveis na tela **Importar → “Sem arquivo à mão? Teste com um exemplo sintético”** (botão **Testar agora**). São 9 arquivos: **3 completos** (3MF com 2 placas e miniatura, G-code estilo Prusa, G-code estilo Bambu), **4 incompletos** (3MF sem fatiamento, 3MF projeto Prusa, G-code Cura sem peso, G-code só com tempo) e **2 inválidos** (texto com extensão .3mf, STL).

**Não são exportações reais** do MakerWorld nem de nenhum programa; os valores são inventados. Cada arquivo carrega o marcador `PRINTUP-SYNTHETIC` (3MF: metadado `PrintUpSynthetic`; G-code: linha de comentário), por isso a ficha exibe o aviso fixo de arquivo sintético, o título começa com “[EXEMPLO SINTÉTICO]” e o aviso é gravado junto aos dados do modelo.

## O que foi testado (e com quê)
| Formato / cenário | Como | Resultado |
|---|---|---|
| 3MF estilo Bambu/Orca, metadados completos | arquivo **sintético** montado no teste | ✅ |
| 3MF sem informações de impressão (só geometria) | sintético | ✅ avisa que é preciso fatiar |
| 3MF projeto PrusaSlicer (sem fatiamento) | sintético | ✅ lê impressora/material, pede para fatiar |
| G-code estilo PrusaSlicer · Bambu Studio · Cura | sintético | ✅ (Cura: sem peso, avisado) |
| G-code só com tempo / sem metadados | sintético | ✅ campos ausentes ficam vazios |
| Arquivo inválido, STL, .bgcode, vazio, falso, truncado | sintético | ✅ recusados com mensagem |
| Arquivo acima de 50 MB | fonte simulada + arquivo de 51 MB no navegador | ✅ recusado sem ler |
| ZIP bomb, zip-slip, senha, duplicados, ZIP64, entradas demais, deflate corrompido | sintético | ✅ recusados |
| Impressora do arquivo ≠ cadastrada | testes de comparação + ficha + calculadora + histórico | ✅ |
| Arquivos publicados em `public/exemplos` (completos, incompletos, inválidos) | `samples.test.ts` com valores esperados | ✅ |
| Marcação de sintético, relatório de leitura (sem vazar conteúdo) | testes unitários | ✅ |
| Fluxo no navegador (ficha → calculadora → produto), inclusive pelos botões “Testar agora” | Playwright + Supabase **falso** | ✅ |
| Regras do banco (origens obrigatórias, isolamento, Storage, cota) | Postgres 16 real com stub do Storage | ✅ |

### NÃO testado (importante)
- **Validação com arquivos reais: pendente.** Roteiro, critérios de aceite e status por programa em `docs/VALIDACAO-ARQUIVOS-REAIS.md`; ferramenta: `npm run validar:arquivo -- arquivo`.
- **Nenhum arquivo real** gerado por Bambu Studio, OrcaSlicer, PrusaSlicer ou Cura. Os leitores seguem a estrutura **conhecida** de cada formato; os arquivos de teste foram montados a partir dela. Portanto **não declaramos compatibilidade** com arquivos reais ainda. Para validar: importe um 3MF baixado do MakerWorld e um G-code real; a ficha mostra "Origem dos dados" e a tela do modelo lista o que foi/não foi encontrado.
- Upload real ao **Supabase Storage** (o teste usa um Storage falso) e as policies do Storage no painel real.
- Navegadores além do Chromium; `DecompressionStream('deflate-raw')` exige Chrome 103+, Safari 16.4+ ou Firefox 113+.

## Limitações conhecidas
- `prediction` (Bambu) e `total estimated time` são tratados como tempo total; se incluem preparo/aquecimento, o tempo pode ser maior que o de impressão pura (a validar com arquivo real).
- O código do fabricante (ex.: `N2S`) **não é traduzido** para o nome da impressora.
- "Suportes": no G-code vale a configuração (habilitado), não se foi realmente usado; no 3MF do Bambu vem `support_used`.
- Desperdício de purga só aparece quando o arquivo informa (`wipe tower` no G-code); não vem do 3MF.
- Cura informa apenas o comprimento do filamento (sem peso); 3MF/UFP do Cura não foram tratados.
- A **origem "arquivo"** é declarada pelo leitor no navegador; o servidor não a reverifica (só seria possível reprocessando o arquivo guardado).
- CRC do ZIP não é verificado; arquivos grandes de geometria nunca são carregados.
- Se o navegador fechar entre o envio e o salvamento, pode sobrar um objeto órfão no Storage (limpeza periódica é um passo futuro).
- Pré-seleção do filamento pelo material do arquivo só ocorre quando há exatamente um filamento cadastrado com aquele material; é editável.
- Importação por link do MakerWorld: **não implementada** (aguarda validação técnica e de termos de uso).
