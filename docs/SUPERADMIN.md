# Superadmin e gestão do SaaS (Etapa 7)

Painel exclusivo da proprietária, em **`/admin`** (não aparece para clientes comuns; quem não é superadmin recebe 404).

## Como criar o primeiro Superadmin (seguro)
1. Crie a conta normalmente em `/cadastro` (ou use a sua conta atual).
2. No **SQL Editor** do Supabase rode (troque pelo seu e-mail):
   ```sql
   select public.grant_superadmin('seu-email@exemplo.com');
   ```
3. Saia e entre de novo no PrintUp: aparece **Administração** no menu lateral (ou acesse `/admin`).

Só o SQL Editor/`service_role` executa `grant_superadmin` e `revoke_superadmin` (o app, mesmo logado como superadmin, não). O último superadmin não pode ser removido. Toda troca de papel entra na auditoria, venha de onde vier. Recomenda-se ligar a verificação em duas etapas (MFA) na conta no Supabase/e-mail.

## O que existe
| Rota | Função |
|---|---|
| `/admin` | Visão geral: usuários, novos no período, assinaturas por situação, **MRR**, **ARR**, **recebido**, cancelamento, usuários por plano. Filtro de período (7/30/90 dias ou datas) |
| `/admin/usuarios` (+ `/[id]`) | Busca/filtro/paginação; plano, situação, último acesso, contagem de produtos/impressoras e limites. Detalhe: uso, cobranças, histórico, eventos do gateway e ações (cortesia, encerrar teste, cancelar no fim do período) |
| `/admin/assinaturas` | Cliente, plano, situação, contratação, próxima cobrança, último pagamento, cancelamento, id no gateway |
| `/admin/planos` | Nome, descrição, preços, limites, recursos, disponibilidade, ordem |
| `/admin/cupons` | Cupons de acesso (teste grátis, cortesia, convite) com validade, limite de usos e e-mail do convidado |
| `/admin/uso` | Totais agregados (produtos, precificações, modelos, orçamentos, pedidos, armazenamento) e por plano |
| `/admin/monitoramento` | Webhooks com erro, pagamentos falhos, armazenamento perto do limite, erros de importação/PDF, eventos de segurança |
| `/admin/auditoria` | Registro **imutável** das ações administrativas |
| `/admin/configuracoes` | Carência de inadimplência, teste grátis nos cadastros, e-mail de suporte, links de termos/privacidade (aparecem no rodapé da página de planos) |

Clientes resgatam cupons em **Minha assinatura → "Tenho um código"**.

## Regras e decisões
- **Autorização em duas camadas:** o servidor confere o papel em cada página/ação (`features/admin/guard.ts`) e o banco confere de novo em cada função `admin_*` (`assert_superadmin`). Sem e-mail fixo e sem checagem só no frontend.
- **Sem leitura ampla:** o superadmin **não** ganha RLS nas tabelas dos clientes (perfis, assinaturas, produtos, modelos…). Consulta só por funções que devolvem contagens/metadados, paginadas (máx. 100/página). Detalhe de usuário não traz nomes de produtos, arquivos, senhas nem tokens, e cada consulta de detalhe é auditada.
- **Preço × assinaturas existentes (política explícita):** mudar o **preço** de um plano **não** altera assinaturas já contratadas (o valor cobrado já está no gateway e as cobranças registradas não mudam). **Limites e recursos** valem para todos do plano na hora (exige confirmação marcada). O Gratuito não pode ser desativado nem ter preço.
- **Pagamentos:** nenhuma função marca pagamento como recebido; só `apply_billing_event` (webhook verificado). Cancelar assinatura paga pelo admin chama primeiro o gateway e só então registra no banco.
- **MRR** = soma mensalizada do valor real da última cobrança recebida (ou do plano, se não houve) das assinaturas **pagas pelo gateway** ativas/com pagamento pendente. Teste, cortesia e cupom não entram; cancelamento agendado aparece à parte. **ARR** = MRR × 12 (projeção). **Recebido** = cobranças confirmadas no período (efetivo). **Taxa de cancelamento** = cancelamentos no período ÷ assinaturas pagas existentes no início (aproximação).
- **Cupons:** liberam um **plano por N dias sem cobrança**. Validade, limite de usos e uso único por pessoa são impostos no banco com trava de linha (`FOR UPDATE`): dois resgates simultâneos do último uso → só um passa (testado com duas conexões reais). Mensagem única para código inexistente/expirado/esgotado. **Descontos em dinheiro não existem** (dependem do gateway real) e por isso não podem ser criados.
- **Auditoria:** `admin_audit_log` é append-only (gatilhos recusam UPDATE/DELETE/TRUNCATE, até para o service_role), gravada na mesma transação da ação, com antes/depois em planos e configurações.
- **Monitoramento:** eventos em `app_events` (gravados pelo servidor, mensagens curtas, metadados só com ids/códigos — `sanitizeMeta`). Falha de gravação nunca derruba a requisição.

## Tabelas e migração
`supabase/migrations/0010_superadmin.sql`: `admin_audit_log`, `app_events`, `coupons`, `coupon_redemptions`; funções `grant_superadmin`, `revoke_superadmin`, `assert_superadmin`, `admin_*` (overview, usuários, detalhe, assinaturas, planos, cupons, configurações, uso, monitoramento, auditoria), `redeem_coupon`; remove as policies administrativas amplas de `profiles`, `subscriptions`, `plans` e `audit_log` (cada um lê só o próprio).

## Testes
`npm run test:db` (`rls_admin.test.sql`: usuário comum e anônimo recusados, superadmin acessa, ninguém altera o próprio papel, consulta de usuários, edição de planos, alterações de assinatura, cupons expirados/esgotados/convite, privacidade, auditoria imutável, indicadores financeiros; `concurrency_admin.sh`: cupom no último uso e duplo clique) · `npm test` (autorização das ações, período, validações, logs sem dados sensíveis) · `npm run test:e2e` (rotas `/admin` protegidas; painel; edição de plano; cupom; configurações; auditoria).

## Pendências / limites conhecidos
- Marca/identidade visual e **modo de manutenção** ainda não são configuráveis (não foram implementados para não parecerem disponíveis).
- Descontos por cupom (dinheiro) aguardam o gateway real.
- Indicadores calculam o estado de cada usuário em tempo real (adequado até alguns milhares de usuários; depois, materializar).
- `app_events` não tem expurgo automático (definir retenção antes de lançar).
- Reconciliação periódica com o gateway ainda não agendada (Etapa 6).
