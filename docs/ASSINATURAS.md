# Assinaturas, planos e pagamentos (Etapa 6)

## Planos (configuráveis no banco, não no código)
`plans` guarda preço mensal/anual, `limits` e `features` (jsonb). Seeds: **Gratuito**, **Pro** (R$ 49,90/mês · R$ 499,00/ano), **Business** (R$ 99,90 · R$ 999,00), além do plano oculto **trial**. Alterar um preço/limite = UPDATE na tabela (sem deploy). Um recurso só aparece como disponível na tela se estiver implementado (`FEATURES[x].available`); "relatórios" e "produção avançada" aparecem como **em breve**.

Cadastro novo: teste de 14 dias (se `platform_settings.trial_enabled`), senão Gratuito.

## Estados e acesso (regra no banco: `current_entitlements`)
| Estado | Acesso |
|---|---|
| gratuito | limites do plano Gratuito |
| em teste | recursos do trial até o fim; depois → expirado |
| ativa | plano contratado |
| pagamento pendente | plano mantido por `billing_grace_days` (7) |
| inadimplente | limites do Gratuito; **dados preservados** |
| cancelamento agendado | plano até o fim do período |
| cancelada / expirada | Gratuito; dados preservados |

## O que é protegido no banco (nunca só no frontend)
Produtos, impressoras, filamentos (triggers com `pg_advisory_xact_lock` → resistem a requisições simultâneas), importações/mês, PDFs/mês (`consume_quota`, uma por orçamento/mês), armazenamento, e recursos: orçamentos, histórico de precificação, pedidos, estoque, produção. Cancelar ou rebaixar **não apaga nada**: apenas bloqueia criar além do limite.

## Webhooks (`/api/webhooks/billing`)
Assinatura HMAC-SHA256 no corpo bruto (401 se inválida, antes de ler o JSON) · idempotência por (gateway, event_id) · log em `billing_events` sem dados sensíveis · eventos fora de ordem ignorados (`last_event_at`) · usuário/plano resolvidos do nosso banco, **nunca do payload** · plano pago só é ativado por evento confirmado, jamais pelo frontend · reconciliação via `fetchSnapshot`.

## Como testar sem gateway (simulador)
Em desenvolvimento: `BILLING_GATEWAY=simulado` e `BILLING_WEBHOOK_SECRET=<≥16 caracteres>` e `SUPABASE_SERVICE_ROLE_KEY` no `.env.local`. Em `/planos` escolha um plano → tela de simulação → "Simular pagamento aprovado". Em Minha assinatura o painel simula renovação, falha, duplicado e cancelamentos. O simulador é **bloqueado** quando `VERCEL_ENV=production`.

## Testes
`npm test` (assinatura, eventos, webhook) · `npm run test:db` (`rls_billing.test.sql`, `concurrency_billing.sh`: limites, upgrade, downgrade, cancelamento, falha, webhook duplicado/inválido, recurso sem permissão, concorrência, dados preservados) · `npm run test:e2e` (fluxo completo no navegador).

## Pendências
Aplicar `0009_billing_plans.sql` no SQL Editor · escolher/configurar gateway real (ver `GATEWAY.md`) · rota de reconciliação periódica (cron) ainda não agendada.
