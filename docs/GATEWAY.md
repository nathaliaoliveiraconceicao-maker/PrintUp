# Gateway de pagamento — comparação e recomendação

> Decisão técnica para a Etapa 6. **Nenhum gateway real está integrado**: só existe o adaptador **simulado** (desenvolvimento, bloqueado em produção). Nenhuma cobrança real é feita sem autorização expressa.

## Critérios e resultado

| Critério | Asaas | Mercado Pago |
|---|---|---|
| Assinatura recorrente | Objeto de assinatura nativo (boleto, cartão; Pix recorrente via "Pix Automático", separado) | `/preapproval` (assinaturas); cancela sozinho após 3 cobranças recusadas |
| Cartão | Sim | Sim |
| Pix | Cobrança Pix por ciclo; Pix Automático separado | Pix Automático depende do banco, plano de valor fixo e exigências de CNPJ (> 6 meses) |
| Webhooks | At-least-once, sucesso só com HTTP 200, autenticação por token estático em cabeçalho, painel de logs | Notificações com assinatura própria |
| Sandbox | Sim | Sim (token `TEST-`) |
| Taxas | **Não verificadas** — conferir na tabela oficial antes de decidir | **Não verificadas** — idem |
| Segurança | Token estático (sem HMAC do corpo): mitigado por token secreto + reconsulta (reconciliação) | Assinatura verificável |
| Manutenção | API simples e voltada ao Brasil | API mais ampla, mais variações por produto |

> Taxas e prazos de repasse mudam e **não foram confirmados** nas páginas oficiais durante este trabalho. Não use este documento como fonte de preços.

## Recomendação: **Asaas**

Motivos: fluxo de assinatura direto (cobrança por ciclo com boleto/cartão/Pix), sandbox completo, webhooks simples de idempotentizar e reconsultar, e menos exigências para um negócio pequeno começar. Ressalvas honestas: o webhook usa token estático — por isso o PrintUp **nunca confia no corpo** do evento: o usuário e o plano vêm do nosso próprio banco (checkout/assinatura) e a **reconciliação** (`fetchSnapshot`) consulta o gateway.

## O que falta para ligar de verdade (depende de você)
1. Confirmar a escolha (Asaas) e conferir as taxas na página oficial.
2. Criar a conta Asaas e a chave de **sandbox** (nunca colar chaves no chat).
3. Eu implemento o adaptador real (`src/lib/billing/asaas.ts`, interface `BillingGateway`) e os testes com respostas gravadas.
4. Testar em sandbox; só então, com sua autorização, trocar para chaves de produção.

Variáveis: `BILLING_GATEWAY` (hoje só `simulado`), `BILLING_WEBHOOK_SECRET` (≥ 16 caracteres), `SUPABASE_SERVICE_ROLE_KEY` (somente servidor).
