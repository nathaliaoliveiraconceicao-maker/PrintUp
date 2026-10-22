# Gateway de pagamento — Mercado Pago (decidido) e comparação

> **Decisão do usuário: Mercado Pago** (já tem conta, pessoa física/CPF). A recomendação técnica original abaixo era Asaas, mas a conta existente pesou mais. Adaptador: `src/lib/billing/mercadopago.ts`. Decisão técnica para a Etapa 6. **Nenhum gateway real está integrado**: só existe o adaptador **simulado** (desenvolvimento, bloqueado em produção). Nenhuma cobrança real é feita sem autorização expressa.

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

## Recomendação técnica original: Asaas (não adotada)

Motivos: fluxo de assinatura direto (cobrança por ciclo com boleto/cartão/Pix), sandbox completo, webhooks simples de idempotentizar e reconsultar, e menos exigências para um negócio pequeno começar. Ressalvas honestas: o webhook usa token estático — por isso o PrintUp **nunca confia no corpo** do evento: o usuário e o plano vêm do nosso próprio banco (checkout/assinatura) e a **reconciliação** (`fetchSnapshot`) consulta o gateway.

## Mercado Pago — como está integrado
- Assinatura `/preapproval` **sem plano associado**, criada como `pending`: o cliente paga no checkout hospedado do Mercado Pago (nenhum dado de cartão passa pelo PrintUp). `external_reference` = id do nosso checkout.
- Webhook (`/api/webhooks/billing`): verificação do `x-signature` (HMAC-SHA256 do manifesto `id:…;request-id:…;ts:…;`). O aviso traz só o id; o estado é lido da API com **nosso** token, então um corpo forjado não muda nada.
- Tópicos tratados: `subscription_authorized_payment` (aprovado → confirmada; recusada/reciclando → falhou) e `subscription_preapproval` (cancelada → cancelamento no fim do período). Falha de rede com o Mercado Pago → 500 para ele reenviar.
- Cancelar: o Mercado Pago cancela na hora (para de cobrar); o PrintUp mantém o plano até o fim do período já pago. Mudar de plano atualiza o valor da recorrência.
- Pessoa física: use **cartão**. Pix recorrente não é tratado (depende de liberação/CNPJ).
- **Trava de segurança:** token `TEST-` é aceito. Token `APP_USR-` só é aceito se o Mercado Pago (`/users/me`) confirmar que pertence a um **usuário de teste** (nickname `TESTUSER…` ou tag `test_user`); falha de rede = recusa. Qualquer outro token (conta real) só funciona com `BILLING_ALLOW_LIVE=sim`. Não ligue isso sem decidir lançar. O painel **Administração → Configurações → Pagamentos: diagnóstico** mostra o que está certo ou errado, sem revelar valores.
- Limitações: o manifesto usa `data.id` do corpo (a documentação cita o parâmetro da URL; confirmar no sandbox). Não foi testado contra o Mercado Pago real, só com respostas simuladas.

## Configurar o ambiente de teste (você)
1. Mercado Pago Developers → criar aplicação → **credenciais de teste** (token `TEST-…`) e criar **usuário de teste** vendedor e comprador.
2. Webhooks da aplicação (modo teste): URL `https://SEU-DOMINIO/api/webhooks/billing`, eventos "Planos e assinaturas"; copiar o segredo.
3. No `.env.local` (nunca no chat): `BILLING_GATEWAY=mercadopago`, `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`, `NEXT_PUBLIC_SITE_URL` (https público; o webhook precisa de URL alcançável, ex.: deploy de preview) e, em teste, `MERCADOPAGO_TEST_PAYER_EMAIL` (e-mail do comprador de teste).
4. `npm run check:env`.
