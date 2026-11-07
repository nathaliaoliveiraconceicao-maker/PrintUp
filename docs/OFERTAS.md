# PrintUp Ofertas (Etapa 8)

Central pública **Ofertas 3D** (`/ofertas`), alertas por e-mail (`/alertas`), integração com a calculadora e administração em `/admin/ofertas`.

## Princípios
- **Nunca inventar**: preço anterior, desconto, cupom e disponibilidade só aparecem quando comprovados (`pricing.ts`). "Preço anterior" vem (a) da própria loja (`loja`) ou (b) da mediana que NÓS observamos (`observado`, mínimo de 4 observações em 3 dias). Sem isso, não há desconto.
- **Regras determinísticas** decidem preços, percentuais e cupons. IA (se usada no futuro) só sugere categoria/equivalência/texto e passa pelas mesmas regras.
- **Publicação**: pontuação 0–100 (`score.ts`, pesos no Superadmin). A publicação automática **começa DESLIGADA**; mesmo ligada, vão para revisão: primeiro registro, preço anterior suspeito, desconto > 70%, sem link de afiliado, sem imagem.
- **Segurança**: leitura pública só de colunas de vitrine e só do publicado (RLS, migration 0017). Credenciais ficam em variáveis de ambiente, nunca no banco. Redirecionamento só pelo id da oferta (`/ir/<id>`), com destino revalidado contra os domínios da loja.
- **Afiliados**: cliques (medidos aqui) ≠ conversões informadas ≠ comissão confirmada (digitadas pelo admin a partir do relatório do programa). Nenhuma receita é "confirmada" sem esse registro.

## Conectores (`src/features/offers/connectors`)
| Conector | Estado | Observações |
|---|---|---|
| `feed_manual` | Pronto | Feed autorizado (JSON/CSV por https) ou importação colada no admin. É a fonte REAL disponível hoje. |
| `shopee` | Preparado, **não verificado** | API de afiliados (GraphQL). Exige aprovação no programa + `SHOPEE_AFFILIATE_APP_ID/SECRET`. Assinatura e campos seguem o que a comunidade documenta; conferir na documentação oficial antes de ativar. |
| `mercadolivre` | Preparado, **não verificado** | Sem API pública conhecida para GERAR link de afiliado: o link vem do portal (colado em `affiliateLinks`). Dados do anúncio pela API de itens (token opcional `ML_ACCESS_TOKEN`); conferir termos. |
| `simulado` | Só desenvolvimento | Requer `OFFERS_ALLOW_SIMULATED=sim`; ofertas saem `is_simulated` e o banco recusa publicá-las. |

Adicionar loja = novo arquivo de conector + registro em `registry.ts`; o núcleo não muda.

## Rotina agendada
- `GET /api/cron/ofertas` (protegido por `Authorization: Bearer $CRON_SECRET`, ≥ 16 caracteres; sem o segredo recusa tudo). Roda as fontes vencidas (uma execução por fonte: índice único), expira ofertas não reverificadas em 72 h (configurável) e dispara alertas.
- **Hospedagem**: o plano gratuito do Vercel só permite cron **1 vez por dia, sem hora exata** (`vercel.json`: 09:00 UTC). Frequência maior exige plano Pro do Vercel ou um agendador do Supabase (`pg_cron` + `pg_net` chamando a mesma URL com o segredo), ainda não configurado.
- Retentativas com backoff (3x) para erros temporários; erros permanentes (credencial) não insistem; limite de requisições por conector (`RateLimiter`); idempotente (rodar de novo não duplica ofertas nem observações recentes).

## Alertas
Tipos: preço abaixo (total ou por kg), desconto comprovado acima de X%, voltou ao estoque. Até 20 por pessoa. Sem repetição (intervalo + queda mínima de 5%). E-mail via Resend (`RESEND_API_KEY`, `EMAIL_FROM`); sem isso o aviso fica registrado como `sem_provedor` (nunca finge envio). WhatsApp/push: coluna `channel` preparada, exige consentimento e integração autorizada.

## Calculadora
Na oferta de filamento: "Usar este preço na minha calculadora". O preço por kg é recalculado no servidor a partir da oferta (com cupom válido), substituir valor existente pede confirmação e mostra a economia por 100 g. Cálculos e produtos já salvos **não mudam**.

## Custos operacionais estimados (ordem de grandeza)
- Hoje: R$ 0 extra (cron diário no plano gratuito; Supabase gratuito suporta o volume inicial).
- E-mail (Resend): plano gratuito cobre ~3.000 e-mails/mês.
- Se precisar de coleta a cada hora: Vercel Pro (~US$ 20/mês) ou `pg_cron` do Supabase (sem custo extra, mas exige configurar `pg_net`).
- Histórico de preços cresce ~1 linha por produto a cada 6 h no máximo; 1.000 produtos ≈ 100 mil linhas/mês (avaliar retenção/rollup depois de alguns meses).

## Limitações conhecidas
- Filtros/ordenação da página pública são feitos em código sobre até 600 ofertas publicadas (suficiente para o início; migrar para filtros no banco se passar disso).
- Cliques são contados por requisição (sem IP/identificação): podem incluir robôs; servem como indicador, não como venda.
