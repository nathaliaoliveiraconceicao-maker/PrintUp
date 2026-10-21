# PrintUp — checklist do Supabase

Estado do projeto real do PrintUp (o código não acessa nem guarda credenciais; só o que você confirmou).
Legenda: ✅ confirmado · ⏳ ação pendente · ❓ não verificado (confira no painel).

## Banco
| Item | Status | Observação |
|---|---|---|
| `0001_core.sql` | ✅ | perfis, planos, assinaturas, impressoras, filamentos, custos, auditoria, RLS |
| `0002_products_pricings.sql` | ✅ | produtos, precificações imutáveis, view `latest_pricings` |
| `0004_harden_functions.sql` | ✅ | corrige leitura de plano de outro usuário via RPC |
| `0005_imports.sql` | ✅ | importador: `imported_models`, `print_profiles`, bucket privado `model-files`, policies e limite de armazenamento por plano (valores provisórios) |
| `0006_catalog_quotes.sql` | ⏳ **rodar no SQL Editor** | catálogo (colunas novas em `products`), `customers`, `business_profiles`, `quotes`, `quote_items`, função `save_quote`, buckets privados `user-images` e `quote-pdfs`, cota de armazenamento somando os 3 buckets |
| `0007_onboarding.sql` | ⏳ **rodar no SQL Editor** | coluna `profiles.onboarding_done_at` (quem já usa o app não volta ao assistente) |
| `0008_orders_production_stock.sql` | ⏳ **rodar no SQL Editor** | `orders`, `order_items`, `order_payments`, `production_jobs`, `job_reservations`, `filament_spools`, `stock_movements`, funções de estoque/produção, `filaments.min_stock_g` |
| Buckets `user-images` e `quote-pdfs` privados | ⏳ | criados pela 0006; conferir em *Storage* que ambos estão **Private** (5 MB por arquivo) |
| Bucket `model-files` privado | ⏳ | criado pela 0005; conferir em *Storage* que está **Private** e com limite de 50 MB |
| Trigger de novo usuário (perfil + teste grátis) | ✅ | cadastro real funcionou |
| Conta superadmin + plano Profissional | ✅ | |
| Security Advisor (*Database → Advisors*) | ❓ | abrir e enviar o resultado |
| RLS ligada em todas as tabelas do schema `public` | ❓ | *Table Editor*: nenhuma tabela deve mostrar "RLS disabled" |

## Autenticação
| Item | Status | Observação |
|---|---|---|
| Site URL e Redirect URLs de `localhost:3000` | ✅ | |
| URL da prévia/produção nos Redirect URLs | ⏳ | quando houver endereço público (ver prévia) |
| "Confirm email" | ❓ | desligado em desenvolvimento; **ligar antes de lançar** |
| Tamanho mínimo de senha | ❓ | o app exige 8; alinhe o Supabase (*Sign In / Providers → Email*) |
| E-mail de confirmação/recuperação | ❓ | o remetente padrão do Supabase serve só para teste e tem limite baixo de envios; **configurar SMTP próprio antes de lançar** |
| Recuperar senha ("esqueci a senha") | ✅ no app / ⏳ no painel | telas `/recuperar-senha` e `/redefinir-senha` prontas e testadas (E2E). **No painel:** adicionar o curinga `http://localhost:3000/**` (e depois `https://SEU-DOMINIO/**`) em *Redirect URLs*, porque o link carrega `?next=/redefinir-senha`. Textos dos e-mails (em inglês por padrão) ainda não foram traduzidos |

## Operação (antes de cobrar clientes)
| Item | Status | Observação |
|---|---|---|
| Região | East US | só latência; trocar exige recriar o projeto (mais fácil antes de haver clientes) |
| Plano pago, backups e sem pausa por inatividade | ❓ | confirme limites do plano gratuito na página de preços do Supabase |
| Chaves | ✅ | no app só a chave pública (`publishable`/`anon`). A `secret`/`service_role` só entra na etapa de pagamentos, apenas no servidor |
| Logs e alertas | ❓ | definir quem recebe aviso de erro |

## Como aplicar a migration 0004 (uma vez)
1. Abra [`0004_harden_functions.sql`](../supabase/migrations/0004_harden_functions.sql) no GitHub → **Copy raw file**.
2. Supabase → **SQL Editor → New query** → cole → **Run**.
3. Esperado: "Success. No rows returned". O app continua funcionando igual.
