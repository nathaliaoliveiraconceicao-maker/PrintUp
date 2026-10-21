# Validação do importador com arquivos reais (etapa pendente)

O importador foi implementado a partir da **estrutura conhecida** de cada formato e testado com **arquivos sintéticos** (ver `docs/IMPORTADOR.md`). Os sintéticos provam que os leitores extraem o que existe e não inventam o que falta. Eles **não** provam que um arquivo exportado de verdade pelo MakerWorld, Bambu Studio, OrcaSlicer, PrusaSlicer ou Cura será lido corretamente.

> Observação: neste ambiente de desenvolvimento não foi possível consultar a documentação online dos formatos nem baixar arquivos reais (a rede é restrita). As chaves reconhecidas vêm do conhecimento prévio do formato e **precisam ser conferidas**.

## Status atual por programa
| Programa | Formato | Leitor | Testado com sintético | Validado com arquivo real |
|---|---|---|---|---|
| Bambu Studio | 3MF fatiado | `readThreeMf` | sim | **não** |
| Bambu Studio | G-code | `readGcode` | sim | **não** |
| OrcaSlicer | 3MF fatiado / G-code | mesmos leitores (estrutura derivada do Bambu) | parcialmente (sem exemplo próprio) | **não** |
| PrusaSlicer | G-code | `readGcode` | sim | **não** |
| PrusaSlicer | 3MF (projeto, sem fatiamento) | `readThreeMf` | sim | **não** |
| Cura | G-code | `readGcode` | sim | **não** |
| Cura | 3MF/UFP | — | não tratado | não |
| MakerWorld | 3MF baixado de um perfil | `readThreeMf` | — | **não** (formato a confirmar com arquivo real) |
| MakerWorld | importação por link | — | não implementada | não |

**Regra:** só marcar um programa como "compatível" (nesta tabela e no produto) depois de cumprir o critério de aceite abaixo.

## Como validar (quando tiver um arquivo real)
1. Tenha o **valor de referência**: abra o arquivo no próprio programa (peso, tempo estimado, impressora, material, número de placas) e anote.
2. Leia com o PrintUp, de um destes jeitos:
   - **Pela tela**: *Importar* → envie o arquivo → abra **Detalhes técnicos da leitura**.
   - **Pelo terminal**: `npm run validar:arquivo -- caminho/do/arquivo.3mf` (aceita vários arquivos).
3. Compare a ficha/relatório com a referência (tabela abaixo).
4. Se algo divergir ou ficar em branco, **copie o relatório** (botão "Copiar relatório de leitura" ou a saída do terminal) e envie para ajuste. O relatório traz só nomes de entradas/chaves e os valores reconhecidos, nunca o conteúdo do arquivo; apague o nome do arquivo se for sensível.

## O que conferir
| Campo | Como conferir | Tolerância |
|---|---|---|
| Peso (g) | igual ao do fatiador, por placa | até 0,1 g |
| Tempo | igual ao total estimado pelo fatiador (anote se inclui preparo) | até 1 min |
| Impressora | nome/modelo igual ao do programa | exato |
| Material | tipo de cada filamento | exato |
| Placas | número de placas e peças por placa | exato |
| Miniatura | imagem corresponde ao modelo | visual |
| Campos ausentes | continuam em branco e listados em "O que não encontramos" | nenhum valor inventado |

## Critério de aceite para declarar compatibilidade
Um programa/formato só é marcado como compatível quando **todos** forem verdadeiros:
- pelo menos **3 arquivos reais** diferentes dele (de preferência 2 versões do programa) foram lidos;
- peso e tempo ficaram dentro da tolerância em todos, ou em branco com aviso (nunca errados);
- nenhum campo foi preenchido com valor que o arquivo não traz;
- os relatórios foram transformados em **testes automáticos** (veja abaixo).

## Transformar um arquivo real em teste (sem guardar o arquivo)
Arquivos reais podem conter dados pessoais ou propriedade de terceiros (modelos do MakerWorld têm licença própria). Por isso **não** se versiona o arquivo: cria-se um teste com os **valores esperados do relatório**, e um arquivo sintético mínimo que reproduza a estrutura observada (nomes de entradas e chaves), identificado como sintético.

## Perguntas a responder com arquivos reais
- O `prediction` do `slice_info.config` é o tempo total (com preparo) ou só a impressão?
- Arquivos baixados do MakerWorld trazem dados de fatiamento por placa ou só geometria?
- O código `printer_model_id` (ex.: `N2S`) pode ser traduzido para o nome da impressora?
- Quais chaves o OrcaSlicer grava diferente do Bambu Studio?
- O Cura grava o peso em algum comentário nas versões atuais?
