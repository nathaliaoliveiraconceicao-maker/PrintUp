# PrintUp

Precificação para quem vende peças impressas em 3D. Next.js 16 + Supabase. Interface em pt-BR, moeda BRL.

## Rodar localmente
```bash
npm install
cp .env.example .env.local      # preencha com os dados do SEU projeto Supabase
npm run check:env               # confere as variáveis (não imprime valores)
npm run dev                     # http://localhost:3000
```
Sem `.env.local`, o app abre uma tela de instruções (`/setup`) em vez de quebrar.

## Conectar o Supabase (uma vez)
1. Crie um projeto em https://supabase.com (região São Paulo, se disponível).
2. **Project Settings → API**: copie *Project URL* e a chave pública (*anon* / *publishable*) para `.env.local`.
   Nunca use a `service_role` no front-end; ela só será necessária na etapa 5 (webhooks) e fica apenas no servidor.
3. **SQL Editor**: execute, nesta ordem, `supabase/migrations/0001_core.sql`, `0002_products_pricings.sql`, `0004_harden_functions.sql`, `0005_imports.sql` (importador) e `0006_catalog_quotes.sql` (catálogo de produtos, clientes, orçamentos e buckets de imagens/PDFs) `0007_onboarding.sql` (assistente de primeiro acesso) e `0008_orders_production_stock.sql` (pedidos, produção e estoque de filamento).
4. **Authentication → URL Configuration**: em *Site URL* use `http://localhost:3000` e em *Redirect URLs* adicione `http://localhost:3000/auth/callback`.
5. (Opcional, só em desenvolvimento) **Authentication → Providers → Email**: desligue *Confirm email* para entrar logo após o cadastro.

## Verificações
```bash
npm run lint && npm run typecheck && npm test   # qualidade + fórmulas financeiras
npm run test:db                                  # migrations + RLS (Postgres descartável, ver CLAUDE.md)
npm run test:e2e                                 # navegador + Supabase falso local (constrói o app sozinho; precisa de Chromium)
npm run build
```

Sem arquivo 3MF/G-code real? A tela **Importar** tem exemplos sintéticos para testar o fluxo (`docs/IMPORTADOR.md`). Para validar com arquivos reais: `npm run validar:arquivo -- arquivo` (`docs/VALIDACAO-ARQUIVOS-REAIS.md`).

Veja `docs/PLANO.md` (arquitetura e etapas) e `CLAUDE.md` (convenções).
