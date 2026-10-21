# Pedidos, produção e estoque — Etapa 5

Migration: `supabase/migrations/0008_orders_production_stock.sql` (rodar depois da 0006 e da 0007).

## Telas
| Rota | O que faz |
|---|---|
| `/pedidos` | Lista com filtros (status, pagamento, cliente/nº, período, impressora, só atrasados) e resumo (em aberto, em produção, atrasados) |
| `/pedidos/novo`, `/pedidos/[id]/editar` | Pedido manual (itens do catálogo e personalizações, desconto, prazo, forma de pagamento). Edição só antes de entrar em produção |
| `/pedidos/[id]` | Itens, lotes de produção, pagamentos, custos e lucro, ações (status, cancelar, excluir) |
| `/producao` | Kanban: Aguardando → Preparando → Imprimindo → Acabamento → Concluído, com filtros e avisos de atraso |
| `/estoque`, `/estoque/[id]` | Saldo por filamento (no saldo, reservado, disponível), alertas, bobinas, ajuste manual e histórico de movimentações |
| Orçamento aprovado | Botão **Transformar em pedido** (ou **Ver pedido** se já virou) |

## Regras
- **Status do pedido ≠ status do pagamento.** Pedido: Novo, Aguardando pagamento, Em produção, Pronto, Entregue, Cancelado. Pagamento: Pendente, Pago em parte, Pago — derivado dos lançamentos (recebimentos e estornos); não dá para "marcar como pago" sem lançar valor, nem receber mais que o saldo.
- **Conversão de orçamento**: só aprovado; um orçamento gera no máximo um pedido (índice único + função idempotente: repetir ou clicar em duas abas devolve o mesmo pedido).
- **Estoque**: bobinas individuais (várias do mesmo material e cor). Cada bobina tem saldo físico e reservado. Orçamento não altera estoque.
  - Criar lote → confere e **reserva** (peso do produto × quantidade, ou gramas informadas, mais margem de purga/desperdício opcional). Sem material suficiente, o lote **não é criado** e a mensagem diz quanto falta; dá para criar mesmo assim, **sem reserva** (fica sinalizado) e reservar depois.
  - Concluir → informa consumo e tempo **reais**; o estoque baixa o real (incluindo suportes, purga e desperdício) e a reserva é liberada. Concluir de novo não baixa outra vez.
  - Falha de impressão → o material perdido sai do estoque na hora, entra no custo real, e a tarefa continua aberta para a reimpressão (a reserva fica).
  - Cancelar tarefa/pedido → libera a reserva. O que já foi consumido continua consumido.
  - Ajuste manual exige motivo e fica no histórico. Livro-razão `stock_movements` é imutável (sem UPDATE/DELETE) e idempotente por chave; saldos só mudam por funções com trava de linha.
- **Alertas**: estoque baixo = disponível (saldo − reservado) ≤ mínimo do filamento (padrão 250 g, editável); bobina acabando (≤ 15%); reservado acima do saldo; tarefa sem reserva; pedido/tarefa atrasados (prazo < hoje, não entregue/cancelado).
- **Custos e lucro** (`features/orders/financials.ts`): custo estimado (do catálogo, no momento do pedido), custo real (consumo real × preço pago na bobina + máquina proporcional ao tempo real + outros custos + falhas), receita recebida (só lançamentos), lucro estimado (total − estimado) e lucro realizado:
  - só aparece com a produção concluída; com pagamento parcial reconhece o custo na mesma fração do recebido (recebido ÷ total);
  - pedido cancelado: recebido − custo já incorrido;
  - em andamento: "—" e o custo registrado até agora.
  - Pedidos cancelados não contam como venda nem como a receber.

## Segurança
RLS por `user_id` em todas as tabelas; policies conferem que cliente, orçamento e produtos referenciados são do usuário. Bobinas, tarefas, reservas e movimentos só são criados/alterados por funções `SECURITY DEFINER` amarradas a `auth.uid()` (cada id recebido é conferido; EXECUTE revogado de `public`/`anon`). Pedido não pode ter o valor recebido alterado diretamente, nem ser cancelado fora da função que libera o estoque. Excluir pedido só enquanto novo, sem produção e sem pagamentos.

## Testes
- `npm run test:db`: criação/edição de pedido, totais, conversão e duplicidade, reserva (inclusive entre bobinas), estoque insuficiente, consumo real ≠ estimado, falha e reimpressão, cancelamento, pagamentos, imutabilidade do livro-razão, isolamento entre usuários e anônimo, e **concorrência real** (`concurrency.sh`: reservas simultâneas, conclusões simultâneas e conversões simultâneas).
- `npm test`: status/atrasos, custos e lucro (parcial, cancelado, falhas), alertas de estoque, mensagens de erro.
- `npm run test:e2e`: estoque, conversão (inclusive aba desatualizada), lotes e reserva, estoque insuficiente, atraso, Kanban, falha, consumo real, pagamento parcial/quitação, entrega, painel, cancelamento, edição/exclusão e celular. Roda contra um Supabase **falso**.

## Limites conhecidos
- Um lote usa um filamento; vários filamentos por peça (multicor) ainda não.
- O custo real de máquina é proporcional ao tempo real (custo do produto × tempo real ÷ estimado), não medido por impressora.
- Listas carregam até 2.000 pedidos de uma vez (sem paginação ainda).
- Sem baixa automática de estoque de peças prontas por entrega.
