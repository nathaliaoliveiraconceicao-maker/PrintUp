# PrintUp — convenções do projeto

SaaS de precificação para impressão 3D. Interface 100% em **pt-BR**, moeda **BRL**. Plano completo: `docs/PLANO.md`.

## Comandos
- `npm run dev` · `npm run build`
- `npm run lint` · `npm run typecheck` · `npm test` (Vitest) — rodar os três antes de concluir qualquer tarefa
- `npm run check:env` — confere variáveis de ambiente sem imprimir valores
- `npm run test:e2e` — fluxos no navegador contra um Supabase **falso** local (`e2e/`); constrói o app sozinho (pasta `.next-e2e`) e exige Chromium (`PLAYWRIGHT_CHROMIUM_PATH`)
- `npm run test:db` — valida migrations (0001, 0002, 0004–0010), RLS e **concorrência real** (`concurrency.sh`) + RLS num Postgres descartável (precisa de `PGHOST/PGPORT/PGUSER`; usa `supabase/tests/00_supabase_stub.sql`, nunca em produção)

## Importador
- Leitura no navegador (`parseBlob`); servidor revalida tudo (`saveImportSchema`) e confere os objetos no Storage. Arquivos em `model-files/<user_id>/…`; o original só é guardado se o usuário pedir.
- Migration `0005` cria o bucket e as policies; limite de armazenamento por plano em `plans.limits.max_storage_mb`.

- Exemplos de teste em `public/exemplos/` são **sintéticos** (marcador `PRINTUP-SYNTHETIC`): nunca apresentá-los como exportações reais. Gerar com `npm run exemplos:gerar`; validar arquivos reais com `npm run validar:arquivo -- arquivo` (`docs/VALIDACAO-ARQUIVOS-REAIS.md`).

## Catálogo e orçamentos (Etapa 3) — `docs/CATALOGO-ORCAMENTOS.md`
- `products` guarda os valores ATUAIS do catálogo; o cálculo que os originou é `pricings` (imutável, `products.pricing_id`). Mudar filamento/impressora/custos **nunca** altera produto nem orçamento sozinho: só `recalculateProducts` (pedido pelo usuário) grava um novo cálculo.
- Orçamento = **retrato**: itens guardam nome, preço, desconto, total e custo da época. Contas em **centavos** (`quotes/calc.ts`), refeitas no servidor; gravação atômica via RPC `save_quote`. Depois de `enviado`, o conteúdo é travado no banco (`quotes_guard`).
- O PDF do cliente nunca tem custo, margem ou lucro: `QuotePdfData` nem possui esses campos e há teste que extrai o texto do PDF. Custo interno só na tela do vendedor.
- Imagens (`user-images`) e PDFs (`quote-pdfs`) são privados, em `<user_id>/…`; o servidor confere o tipo real pelos bytes (`lib/image-type.ts`). `status = 'expirado'` é derivado da validade (não gravado).

## Pedidos, produção e estoque (Etapa 5) — `docs/PEDIDOS-PRODUCAO-ESTOQUE.md`
- Estoque por bobina com **dois saldos**: `remaining_g` (físico) e `reserved_g` (comprometido). Orçamento nunca mexe em estoque; criar tarefa **reserva**, concluir **consome** (valor REAL), cancelar **libera**. Saldos só mudam via funções SQL (`create_job`, `complete_job`, `report_failure`, `cancel_*`, `adjust_spool`) que travam linhas e escrevem no livro-razão imutável `stock_movements` (idempotente por chave). Nunca dar UPDATE direto em saldo.
- Pedido: status de produção/entrega (`orders.status`) é independente do pagamento (`order_payments`; `payment_status` e `amount_paid` são derivados por trigger). Receita recebida = soma dos lançamentos. Um orçamento gera no máximo um pedido (índice único + RPC idempotente).
- Custo real e lucro realizado: `features/orders/financials.ts` (puro e testado). Lucro realizado só existe com a produção concluída (proporcional ao recebido) ou pedido cancelado; antes disso é "em andamento".
- Testes SQL usam o sentinela `raise exception 'deveria ter falhado' using errcode = 'XX999'` (com P0001 o teste se auto-captura e passa vazio).

## Next.js 16 (leia `node_modules/next/dist/docs/` antes de usar APIs novas)
- `middleware` agora é `src/proxy.ts`. `params`, `searchParams`, `cookies()`, `headers()` são **assíncronos**.
- `cacheComponents` está **desligado** de propósito: o app é autenticado e dinâmico. Se ligar, toda rota dinâmica precisa de `<Suspense>`.

## Arquitetura
- Lógica por domínio em `src/features/<dominio>/` (`schema.ts`, `actions.ts`, formulários). Rotas em `src/app` só compõem.
- **Motor financeiro** em `src/lib/pricing`: funções puras, sem I/O, sem React. Toda mudança de fórmula exige teste em `calculate.test.ts`. Valores em reais, percentuais em pontos (12 = 12%), tempo em minutos, massa em gramas.
- Não contar custo duas vezes (flags `hourlyCostIncludes`). Margem = sobre o preço; markup = sobre o custo. Nunca misturar os termos na UI.
- **Nunca inventar dados ausentes** (importações): campo desconhecido é `null`/em branco e a origem do dado (`arquivo` | `manual`) é registrada; o banco exige origem para peso/tempo presentes. Detalhes e limites: `docs/IMPORTADOR.md`.
- Arquivos importados (3MF/G-code) são **não confiáveis**: leitores só em `src/features/imports/readers`, ZIP só via `safe-zip.ts` (limites de bytes), nada executado, textos limpos com `cleanText`. Não declarar compatibilidade com um programa sem teste que a comprove.

## Segurança (inegociável)
- Funções `SECURITY DEFINER` nunca confiam em ids vindos do chamador e têm `EXECUTE` revogado de `public`/`anon` (o Supabase concede a `anon` por padrão). Teste em `supabase/tests/rls_etapa0.test.sql`.
- Autorização no banco: toda tabela de cliente tem RLS `user_id = auth.uid()`. Nova tabela = RLS + policy + teste em `supabase/tests/rls.test.sql`.
- Limites e recursos pagos são impostos por trigger/`current_entitlements()`; **nunca** só no frontend.
- Use `supabase.auth.getUser()` (valida o token), não `getSession()`, para decisões de acesso.
- `SUPABASE_SERVICE_ROLE_KEY` só em código de servidor (webhooks/admin). Nunca `NEXT_PUBLIC_`.
- Formulários com Server Action usam `useActionForm` (`src/lib/use-action-form.ts`), **não** `<form action>` puro: o React 19 apaga os campos quando a action devolve erro.
- Precificações salvas (`pricings`) são snapshots imutáveis: o servidor **recalcula** com `calculatePricing` antes de gravar. Mudou a fórmula? Incremente `PRICING_ENGINE_VERSION`.
- Mutações = Server Actions com validação Zod no servidor; erros do banco passam por `dbErrorMessage` (sem vazar detalhes).
- Webhooks: verificar assinatura no corpo bruto + idempotência via `billing_events`.

## Código
- TypeScript estrito; sem `any`. Imports com `@/`.
- Componentes de UI em `src/components/ui` (estilo shadcn); utilitário `cn()`. Campos numéricos: `inputMode="decimal"` e `parseDecimal` (aceita vírgula).
- Mobile primeiro: alvos de toque ≥ 44px, navegação inferior no celular, fonte ≥ 16px em inputs.
- Textos de interface em português do Brasil; identificadores de código em inglês; rotas em português (`/impressoras`).
- Migrations em `supabase/migrations/NNNN_nome.sql`, nunca editar uma já aplicada.
- O build não pode exigir credenciais: chame `cookies()` antes de checar env em código de servidor. Sem env, o proxy leva a `/setup`.
- Sem dependências novas sem necessidade clara.

## Design
Identidade (Etapa 4): **grafite** (`--ink`), **laranja vibrante** (`--accent`) e neutros (`--paper`, `--surface`, `--line`). Botão primário = laranja com texto grafite (contraste 5,4:1; texto branco sobre laranja não passa no AA). Links/ênfase em laranja usam `--accent-strong`. Números com `.num` (mono, tabular). Navegação em `components/app-nav.tsx`; módulos futuros (Pedidos, Estoque) aparecem só como "em breve", sem link. Evitar visual genérico de dashboard (gradientes roxos, cards idênticos sem hierarquia).

## Painel, calculadora e onboarding (Etapa 4) — `docs/ETAPA4-UX.md`
- Painel só mostra dados reais (`features/dashboard/metrics.ts`). Orçado ≠ vendido: sem módulo de vendas, nada é apresentado como faturamento; lucro estimado = aprovado − custo de produção, só dos aprovados com custo conhecido.
- Calculadora: modo rápido e avançado usam o **mesmo** `calculatePricing`; o modo só muda o que aparece. Desconto ao cliente é simulação (`applyDiscount`), não altera o motor nem o que é salvo. Acabamento soma com embalagem.
- Onboarding (`/boas-vindas`): cada passo grava no Supabase; pular não grava; `profiles.onboarding_done_at` (migration 0007) impede que volte sozinho. Refazer não duplica impressora/filamento (atualiza o primeiro).

## Assinaturas e cobrança (Etapa 6) — `docs/ASSINATURAS.md`, `docs/GATEWAY.md`
- Plano/limites/recursos vivem em `plans` (jsonb), nunca em constantes. O acesso efetivo vem de `current_entitlements()`; limites por trigger com `pg_advisory_xact_lock`; PDFs por `consume_quota`.
- **Nunca** ativar plano pago por ação do frontend: só `apply_billing_event` (service_role), chamado pelo webhook verificado (HMAC no corpo bruto, idempotente, fora de ordem ignorado). Usuário/plano vêm do nosso banco, não do payload.
- Cancelar/rebaixar não apaga dados. Simulador (`BILLING_GATEWAY=simulado`) é bloqueado em produção. Cobrança real só com autorização do usuário; gateway escolhido: **Mercado Pago** (`lib/billing/mercadopago.ts`; token não-`TEST-` bloqueado sem `BILLING_ALLOW_LIVE=sim`). O webhook do MP traz só o id: o estado vem da API, nunca do corpo.

## Superadmin (Etapa 7) — `docs/SUPERADMIN.md`
- Papel `superadmin` só via `grant_superadmin(email)` (SQL Editor/service_role); o app nunca altera papéis. Sem e-mail fixo. Toda troca de papel é auditada por gatilho.
- O superadmin **não** tem RLS amplo nas tabelas de clientes: consulta só por funções `admin_*` (autorizam com `assert_superadmin()`, paginadas, só contagens/metadados). Nova função administrativa = `assert_superadmin()` + `admin_log()` na escrita + teste em `rls_admin.test.sql`.
- Páginas `/admin/*` usam `requireAdminPage()` (404 para não admin); Server Actions usam `currentAdmin()`. Nenhuma ação marca pagamento como recebido.
- Preço de plano não altera assinaturas existentes; limites/recursos valem para todos do plano. `admin_audit_log` é imutável. Logs operacionais: `logEvent()` (só ids/códigos, nunca dados pessoais ou segredos).

## Configurações completas — `docs/CONFIGURACOES.md`
- Custos e preço são configurados **uma vez** em `/configuracoes` (despesas itemizadas, rateio por faturamento/hora/peça, margem ou multiplicador, arredondamento) e reutilizados pela calculadora, onboarding e `recalculateProducts`. Canais de venda (`sales_channels`) guardam só taxas informadas pelo usuário: nunca embutir tabelas "oficiais" de marketplace. Código que lê `cost_settings` deve usar `settingsOrDefault` (contas anteriores à migration `0011`).
