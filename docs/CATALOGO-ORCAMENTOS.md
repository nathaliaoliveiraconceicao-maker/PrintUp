# Catálogo ("Meus produtos") e Orçamentos — Etapa 3

## Fluxo principal
Importar modelo → Calcular preço → **Salvar como produto** → **Criar orçamento** → **Compartilhar / PDF**.

## Telas
| Rota | O que faz |
|---|---|
| `/produtos` | Catálogo: busca, filtro por categoria e por visão (Ativos, Com estoque, Custos mudaram, Arquivados), duplicar, arquivar, aviso de custos desatualizados |
| `/produtos/novo`, `/produtos/[id]/editar` | Ficha completa (foto, categoria, impressora, filamento, peso, tempo, custos, preço, estoque, link do modelo, licença) |
| `/produtos/[id]` | Ficha, estoque, histórico de preços, origem dos dados |
| `/produtos/recalcular` | Compara custos de hoje × salvos e recalcula **só se o usuário confirmar** |
| `/orcamentos` | Histórico com status (Rascunho, Enviado, Aprovado, Recusado, Expirado) e busca |
| `/orcamentos/novo`, `/orcamentos/[id]/editar` | Editor: cliente, produtos do catálogo, personalizações, desconto por item e no total, prazo, validade, pagamento, observações |
| `/orcamentos/[id]` | Detalhe, status, duplicar, compartilhar, visão do vendedor (custo/resultado) |
| `/orcamentos/[id]/pdf` | PDF do cliente (só para o dono logado) |
| `/negocio` | Identidade do vendedor: logo, nome, contato, cor, padrões de validade/pagamento |

## Regras
- **Preços históricos não mudam sozinhos.** O produto guarda custo, preço, margem, peso e tempo; o cálculo de origem fica em `pricings`. Se filamento, impressora, energia ou custos fixos mudarem, a lista mostra "Custos mudaram: hoje seria R$ X" e a tela *Recalcular* mostra antes/depois. Recalcular grava **novo** item no histórico.
- Calculadora → "Salvar como produto": produto novo ou atualização de um existente (aviso explícito). Peso, tempo, impressora, filamento e custos vêm do cálculo refeito no servidor.
- **Margem**: de cálculo = líquida (após taxas/impostos); preço digitado à mão = **bruta** `(preço − custo) ÷ preço`, rotulada como tal.
- **Orçamento é um retrato.** Mudar/excluir o produto depois não altera orçamentos feitos. Enviado/aprovado/recusado: conteúdo travado no banco; para mudar, duplicar. Só rascunhos são excluídos.
- **Contas** em centavos; desconto de linha em %, desconto total em % ou R$ (limitado ao subtotal); o servidor refaz tudo e o banco confere soma dos itens = subtotal.
- **Expirado** é calculado pela validade (hoje em Brasília); transições válidas espelhadas em `quotes/status.ts` e `quotes_guard`.
- **PDF** (pdf-lib): identidade do vendedor, nº, emissão, validade, prazo, cliente, itens, descontos, total, pagamento, observações. Sem custo/margem/lucro por construção (tipo `QuotePdfData`) e por teste.
- **WhatsApp**: link `wa.me` com texto pronto + link temporário do PDF (válido até o fim da validade, máx. 30 dias). Sem API do WhatsApp. Também há "copiar link" e compartilhamento nativo do celular.
- **Pedido**: botão "Transformar em pedido" aparece desabilitado em orçamentos aprovados (etapa futura).

## Segurança
RLS `user_id = auth.uid()` em `customers`, `business_profiles`, `quotes`, `quote_items`; policies conferem também que cliente/produto/impressora/filamento/cálculo referenciados são do próprio usuário. Número do orçamento atribuído por trigger (por usuário). Imagens e PDFs em buckets privados com pasta do dono; tipo real validado no servidor; limite do plano (`max_quotes`) e de armazenamento por trigger/policy.

## Testes
- `npm test`: contas do orçamento, status, WhatsApp, PDF (extrai o texto e prova ausência de custos), custo do produto, recálculo, caminhos/bytes de imagem, schemas.
- `npm run test:db`: isolamento entre usuários, numeração por usuário, `save_quote` atômico, travas após envio, transições, retrato do cliente, limites do plano, cota de Storage somando 3 buckets, preenchimento retroativo de produtos antigos.
- `npm run test:e2e`: catálogo (busca, edição, foto, duplicar, arquivar, filtros, custos mudaram → recalcular), Meu negócio, orçamento com vários itens/desconto, PDF, WhatsApp, travas, duplicar, histórico, celular. (Contra um Supabase **falso**; não prova o Supabase real.)

## Limites conhecidos
- Sem teste automatizado contra o Supabase real (Storage real, e-mails). O `test:db` usa Postgres puro com um stub do Supabase.
- Foto de produto no PDF e logo: apenas JPG/PNG (WebP é aceito no bucket mas o PDF o ignora).
- Cliente abre o link do PDF sem login: quem tem o link acessa até expirar.
- Nada de pedidos, estoque automático por venda, nem cobrança nesta etapa.
