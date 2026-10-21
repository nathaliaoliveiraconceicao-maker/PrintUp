# PrintUp — Plano técnico

Plataforma SaaS de precificação para quem vende peças impressas em 3D. Interface em pt-BR, moeda BRL.

## 1. Arquitetura

| Camada | Escolha | Observação |
|---|---|---|
| App | Next.js (App Router) + TypeScript estrito | Server Components por padrão; Server Actions para mutações |
| UI | Tailwind v4 + componentes no estilo shadcn/ui (`src/components/ui`) | Tokens de tema em `globals.css` |
| Dados/Auth | Supabase (Postgres, Auth, Storage) | Acesso sempre com a sessão do usuário → RLS decide |
| Validação | Zod | Mesmo schema no servidor (actions) e no cliente (calculadora) |
| Motor financeiro | `src/lib/pricing` — funções puras, sem I/O | 100% testado; é o que gravará o snapshot em `pricings` |
| Multi-tenant | Tenant = usuário (`user_id` em toda tabela de dados, RLS `user_id = auth.uid()`) | Equipes/organizações ficam para depois (migração: `org_id` + membership) |
| Cobrança | Gateway-agnóstico: `plans`, `subscriptions`, `billing_events` | Webhook → `service_role` → atualiza `subscriptions` |

**Princípios de segurança**
- Autorização no banco (RLS + triggers). O frontend só melhora a experiência.
- Limites do plano (`max_printers`, …) e assinatura expirada são impostos por trigger (`enforce_plan_limit`), não por `if` no React.
- `role` do perfil só muda via `service_role` (trigger `protect_profile_role`).
- `SUPABASE_SERVICE_ROLE_KEY` só em código de servidor (webhooks, admin), nunca com `NEXT_PUBLIC_`.
- Webhooks: verificar assinatura do gateway sobre o corpo **bruto**, gravar em `billing_events` com `unique(gateway, event_id)` (idempotência), processar, marcar `processed_at`.
- Superadmin não ganha policies amplas nas tabelas dos clientes; consultas administrativas rodam no servidor com `service_role` e rota protegida.

## 2. Estrutura de pastas

```
src/
  app/
    (auth)/login, cadastro     # público
    (app)/                     # área logada (layout com navegação)
      page.tsx                 # dashboard
      calculadora/  impressoras/  filamentos/  configuracoes/
      # etapas futuras: produtos/ orcamentos/ importar/ conta/
    (admin)/                   # etapa 6: superadmin
    api/webhooks/billing/      # etapa 5
    auth/callback/route.ts
  features/<dominio>/          # schema.ts (zod+tipos), actions.ts ("use server"), *-form.tsx
  components/ui/               # botões, campos, cards
  lib/
    pricing/                   # motor financeiro puro + testes
    supabase/                  # clientes server/browser + sessão (proxy)
    forms.ts utils.ts
  connectors/                  # etapa 4: interface + adapters por site
  proxy.ts                     # renova sessão, redireciona anônimos
supabase/migrations/           # SQL versionado
supabase/tests/                # teste de RLS (psql)
docs/
```

## 3. Modelo de dados

Implementado: `0001_core.sql` (`profiles`, `plans`, `subscriptions`, `billing_events`, `printers`, `filaments`, `cost_settings`, `audit_log`) e `0002_products_pricings.sql` (`products`, `pricings`, view `latest_pricings`).
`pricings` é um **snapshot imutável** (entrada + resultado + versão do motor; sem policy de UPDATE); o servidor recalcula o resultado antes de gravar, nunca confia no navegador.
Planejado (rascunho em `0003_catalog_planned.sql.draft`): `imported_models`, `print_profiles`, `quotes`, `quote_items`.

Pontos de projeto:
- `printers.hourly_cost` + flags `hourly_includes_{energy,wear,fixed}` formalizam o "não contar duas vezes".
- `subscriptions`: índice único parcial garante uma assinatura viva por usuário; `current_entitlements()` é a fonte única de limites/recursos.
- `audit_log` alimentado por trigger (insert/update/delete) com `old`/`new`.
- Novo usuário recebe perfil + assinatura `trialing` via trigger em `auth.users`.

## 4. Telas do MVP

1. Login / Cadastro (confirmação por e-mail)
2. Dashboard: atalho para calculadora, parâmetros de custo, uso do plano, status do teste
3. Impressoras (lista, criar, editar, excluir)
4. Filamentos (idem)
5. Configurações de custo (fixos, energia, mão de obra, perdas, taxas, impostos, margem)
6. Calculadora (resultado ao vivo; no celular, preço fixo na base da tela)
7. Produtos (lista com último preço e alerta de margem; histórico de precificações com composição do custo)
8. Histórico de operações e menu "Mais" (celular)
9. Etapas seguintes: Orçamentos, Importar modelo, Conta/Plano, Admin

## 5. Fórmulas (`src/lib/pricing`)

Por unidade, `h` = horas de impressão, `q` = unidades:
- material = g/1000 × R$/kg · máquina = custo/hora × h · energia = W/1000 × h × R$/kWh · desgaste = R$/h × h
- fixo: por hora = mensal ÷ horas produtivas × h; por peça = mensal ÷ peças/mês
- **perdas** = % × (material + máquina + energia + desgaste) — não incide sobre mão de obra, embalagem nem rateio fixo
- mão de obra = (preparo do lote + min/unid × q) ÷ 60 × R$/h
- **Anti-dupla-contagem**: se o custo/hora informado "inclui" energia/desgaste/fixos, o componente é zerado e um aviso aparece.
- **Margem** (sobre o preço): `preço = (custo + taxa fixa) ÷ (1 − taxa% − imposto% − margem%)`; exige soma < 100%.
- **Markup** (sobre o custo): `preço = custo × (1 + markup%)`; taxas e impostos saem do preço, então a margem real é menor e é exibida.
- Lucro, taxas e impostos são derivados do preço já arredondado em centavos, para a conta fechar.
- Decisão: tempo e peso são **por unidade**; o lote multiplica pela quantidade.

## 6. Importação de modelos / MakerWorld

**Status da investigação (honesto):** não consegui acessar o MakerWorld a partir do ambiente de desenvolvimento, e uma busca não encontrou API pública oficial nem termos que autorizem leitura automatizada. Existem scrapers de terceiros, o que **não** implica permissão. Portanto: **não presumimos API oficial** e nada que dependa do site é considerado confiável até a verificação abaixo.

Estratégia, em ordem de confiabilidade:
1. **Arquivo `.3mf` / `.gcode` (confiável, primeira entrega da etapa 4).** Arquivos fatiados (Bambu Studio/Orca/Prusa) carregam peso e tempo estimados em metadados/cabeçalho. Parser local, sem rede. O usuário baixa o arquivo do MakerWorld e envia.
2. **Entrada manual** sempre disponível.
3. **STL sem fatiamento:** tratado à parte — só geometria (volume), sem tempo/peso reais; o app pede fatiamento ou estimativa manual e marca o dado como "estimado".
4. **Conector por URL (spike, depois de 1–3).** Antes de codar: ler ToS e robots.txt do MakerWorld, verificar se existe endpoint documentado, medir se a página pública expõe peso/tempo por perfil. Se não permitido ou instável, o conector fica desativado e a UI orienta o upload do arquivo.

Arquitetura extensível (`src/connectors/`):
```ts
interface ModelConnector {
  id: string; name: string; matches(url: URL): boolean;
  fetchModel(url: URL): Promise<ConnectorResult>;   // título, perfis disponíveis
}
type ProfileData = { name: string; weightG?: number; printMinutes?: number; source: "connector"|"3mf"|"gcode"|"manual" };
```
Regras: campo ausente = `undefined` (**nunca** inventar valor); cada dado importado guarda `source`; adapters isolados em `connectors/<site>/` com testes sobre fixtures; erros de rede/ToS devolvem resultado tipado, não exceção; limite de taxa e cache por URL.

## 7. Plano em etapas

| # | Entrega | Status |
|---|---|---|
| 1 | Auth, impressoras, filamentos, configurações, calculadora, motor testado, RLS, limites por plano | **feito** |
| 2 | Salvar precificações e produtos (`pricings`, `products`), dashboard financeiro real, histórico | **feito** |
| 3 | Orçamentos (itens, validade, PDF/compartilhar) | |
| 4 | Importação: parser 3MF/G-code → perfis de impressão; STL separado; spike do conector MakerWorld | |
| 5 | Billing: webhook idempotente, gateway (ex.: Stripe/Asaas/Mercado Pago), portal da assinatura, bloqueio por status | |
| 6 | Superadmin: usuários, planos, métricas, impersonação auditada | |
| 7 | Polimento: testes E2E, observabilidade, LGPD (exportar/excluir conta), PWA | |
