# PrintUp — Análise e roadmap (visão comercial)

Documento de planejamento. **Nada aqui foi implementado ainda**; o código atual não foi alterado por este plano.
Data da análise: 2026-10-21 · Base analisada: branch `etapa-2-produtos` (commit `f7a037f`).

---

## Decisões do dono do produto (2026-10-21)

Ordem de desenvolvimento aprovada (substitui a ordem das seções 4 onde diferir):
1. **Validar e concluir a base**: Supabase, autenticação, impressoras, filamentos, calculadora (**Etapa 0**, em andamento).
2. **Importação de arquivos 3MF e G-code**, com leitura de peso e tempo quando disponíveis.
3. **Catálogo de produtos, histórico de precificações e orçamentos em PDF.**
4. **Experiência visual**: assistente de configuração inicial e calculadora intuitiva (camadas de custo).
5. **Planos de assinatura, pagamentos e superadministrador.**

Diretrizes: a **precificação automatizada** é o principal diferencial comercial; a **importação por link do MakerWorld** fica no roadmap, **sem ser dependência do MVP**; conceito visual de cores quentes e composição de custos em camadas **aprovado**; cada funcionalidade é testada antes de avançar.

---

> **Atualização (Etapa 3 concluída em desenvolvimento):** catálogo "Meus produtos", orçamentos em PDF com compartilhamento por WhatsApp e "Meu negócio" estão implementados e testados (ver `docs/CATALOGO-ORCAMENTOS.md`). Dependem da migration `0006`. Próximas: experiência visual (item 4) e assinaturas/pagamentos/superadmin (item 5).

---

## 1. Situação real

### 1.1 Código e testes (verificado agora, do zero)

| Verificação | Resultado |
|---|---|
| ESLint | sem erros |
| TypeScript (`tsc --noEmit`) | sem erros |
| Testes unitários (Vitest) | 43 de 43 passam (motor financeiro 28, validação de formulários 5, produtos 5, env 3, utilitários 2) |
| Migrations + RLS em Postgres 16 real | 0001 e 0002 aplicam sem erro; testes de isolamento passam |
| Build de produção | compila; sem credenciais também (cai na tela `/setup`) |
| `npm audit` (produção) | 0 vulnerabilidades (as 5 do audit completo são do ESLint, ferramenta de dev) |

Tamanho: 17 rotas, ~3.000 linhas de TypeScript, 2 migrations (10 tabelas + 1 view).

**O que NÃO tem teste automatizado:** telas e Server Actions. Foram validadas em navegador contra um Supabase falso local (script fora do repositório) e, manualmente por você, contra o Supabase real. Não existe teste E2E versionado.

### 1.2 Supabase (projeto real do PrintUp)

Eu **não tenho acesso** ao seu projeto (nem devo ter credenciais). O que sei vem do que você executou e confirmou:

| Item | Status | Base |
|---|---|---|
| Migration `0001_core.sql` aplicada | confirmado | "Success. No rows returned" no print |
| Migration `0002_products_pricings.sql` aplicada | confirmado | salvar precificação e produtos funcionou no app real |
| Cadastro cria perfil + teste grátis (trigger) | confirmado | conta criada e dashboard abriu |
| Login/redirects | confirmado | login funcionou em `localhost:3000` |
| Conta superadmin + plano Profissional | confirmado | SQL rodou e a conferência retornou |
| Região | **East US** (não São Paulo) | print do painel; só afeta latência |
| Security Advisor do Supabase | **não verificado** | você precisa abrir *Database → Advisors* e me mostrar |
| "Confirm email" | **não verificado** | desligamos para desenvolvimento; ligar antes de lançar |
| Backups | **não verificado** | projetos gratuitos não têm backups diários nem recuperação pontual e podem ser pausados por inatividade (confirme na página de preços do Supabase) — um produto pago precisa de plano pago |

### 1.3 Achado de segurança (reproduzido por mim)

`current_entitlements(p_user uuid)` é `SECURITY DEFINER` e aceita qualquer id. Com os grants padrão do Supabase (função executável por `anon` e `authenticated`), **qualquer pessoa que conheça o UUID de um usuário consegue consultar plano, status e limites dele** via RPC; inclusive sem login. Reproduzi isso emulando os grants padrão num Postgres local; não consultei o seu projeto.

- Gravidade: baixa (o UUID não é adivinhável e o dado é de plano), mas é um erro meu e vira vazamento se o conteúdo de `features` crescer.
- Correção planejada (Etapa 0): migration `0004` revogando `EXECUTE` de `public/anon`, e a função passa a ignorar `p_user` quando o chamador não é `service_role`/superadmin. Com teste de regressão em `rls.test.sql`.

### 1.4 Referência de mercado (calc3d.com.br)

**Não consegui analisar.** O ambiente de execução bloqueia o domínio (403 no túnel de rede; o mesmo vale para `makerworld.com`). Não vou supor o que o concorrente tem. Duas opções para destravar (ver seção 7):
1. liberar os domínios na política de rede do ambiente; ou
2. você me enviar prints de `/#calculadora` e `/planos`.

Enquanto isso, o roadmap abaixo parte **da sua visão**, e não de uma comparação campo a campo. Quando eu puder ver o concorrente, faço a comparação e ajusto prioridades — sem copiar identidade visual, código, textos ou layout (e, sem tê-lo visto, não há risco de cópia involuntária).

---

## 2. Visão × o que existe hoje

| # | Diferencial pedido | Hoje | Lacuna |
|---|---|---|---|
| 1 | Importar por link (MakerWorld) | nada | Conector isolado; depende de rede, termos de uso e dados reais (seção 5) |
| 2 | Importar 3MF e G-code | nada | Parser de arquivo + tabelas de modelo/perfil; STL tratado à parte |
| 3 | Impressoras de vários fabricantes | **parcial**: nome, marca, modelo livres, potência, custo/hora, desgaste manual | Depreciação automática (preço, vida útil, valor residual), manutenção, "perfil de impressora" por modelo, sugestão de marcas |
| 4 | Filamentos + estoque | **parcial**: preço/kg, material, cor | Carretéis com saldo em gramas, movimentações, alerta de estoque baixo |
| 5 | Calculadora completa | **quase**: fixos, energia, máquina, desgaste, perdas, mão de obra, embalagem, taxas, impostos, margem | Depreciação automática; **vários filamentos/cores por peça**; custos de pós-processamento |
| 6 | Margem × markup | **feito** (ambos exibidos, conversão testada) | Mostrar lado a lado ("para a mesma margem, o markup seria X") |
| 7 | Venda direta × marketplaces | **parcial**: um conjunto de taxas por cálculo | Canais de venda cadastráveis e simulação de **todos os canais ao mesmo tempo** |
| 8 | Catálogo com fotos, custos, preços, histórico | **parcial**: produtos + histórico imutável de preços | Fotos (Storage), SKU, descrição, ligação com perfil de impressão/canal |
| 9 | Orçamentos em PDF | nada | Tabelas de orçamento, PDF, validade, link de compartilhamento |
| 10 | Pedidos e fila de produção | nada | Fase futura; só reservar o modelo de dados |

Requisitos de experiência:

| Requisito | Hoje |
|---|---|
| Português do Brasil, BRL | feito |
| Celular e computador | feito (navegação inferior, preço fixo na calculadora) |
| Configuração inicial guiada | **não existe** (só a tela técnica `/setup`) |
| Recuperação de senha | **feito** (`/recuperar-senha`, `/redefinir-senha`; resposta neutra, sem revelar quais e-mails têm conta) |
| Preenchimento automático | parcial (preço do filamento; padrões dos custos) |
| Alterar qualquer estimativa importada | **a projetar**: todo valor importado precisa guardar *origem* e ser editável |
| Avisar quando tempo/consumo é de outra impressora | **a projetar** (seção 5.3) |
| Não inventar dados ausentes | regra já documentada; vira requisito de modelo de dados |

---

## 3. O que aproveitar e o que refatorar

**Aproveitar sem mudar** (investimento já feito e testado):
- Motor financeiro `src/lib/pricing` (puro, 28 testes, anti-dupla-contagem, margem/markup).
- Padrão de segurança: RLS por `user_id`, limites de plano por trigger, `current_entitlements`, auditoria, snapshots imutáveis.
- Cadastro/login, `proxy.ts`, `/setup`, `check:env`, `useActionForm`, validação Zod no servidor.
- Estrutura de pastas por domínio, harness de teste de banco (`npm run test:db`).
- Produtos + `pricings` (snapshot imutável recalculado no servidor).

**Refatorar antes de crescer** (dívida real, não cosmética):
1. **Calculadora (`calculator.tsx`, ~400 linhas, ~20 `useState` de texto).** Importação, cenários e canais precisam preencher/gerenciar o mesmo estado. Trocar por um modelo único de "rascunho de cálculo" (reducer) + componentes por seção. Sem isso, cada nova funcionalidade multiplica o risco de bug.
2. **Motor v2 (compatível).** Aceitar *lista de materiais* (vários filamentos/cores), depreciação calculada a partir da impressora e custos de pós-processamento. Incrementa `PRICING_ENGINE_VERSION` para 2; os snapshots v1 já gravados continuam legíveis (guardam entrada e resultado).
3. **Navegação.** Com Importar, Catálogo, Orçamentos, Pedidos o menu atual não cabe; reorganizar (seção 6.3).
4. **Testes de interface.** Levar o E2E para dentro do repositório (Playwright), em vez de scripts soltos.

---

## 4. Roadmap

Regra de trabalho: **uma etapa por vez; cada etapa termina com critério de aceite verificado** (testes automatizados + roteiro que você executa no navegador) antes da próxima. Tamanhos: P (pequena), M (média), G (grande).

### Etapa 0 — Validação e endurecimento (P) — **implementada; falta aplicar a migration 0004 no Supabase real**
- Migration `0004`: corrigir `current_entitlements`, revogar execução desnecessária de funções.
- Teste de regressão (anônimo e outro usuário não leem direitos alheios).
- E2E (Playwright + Supabase falso local) versionado em `e2e/` (`npm run test:e2e`); checklist do Supabase em `docs/SUPABASE.md`.
- Você: conferir Security Advisor no Supabase.
- **Aceite:** `test:db` com o novo teste; Advisors sem erro.

## MVP — "importo, calculo, defino lucro, cadastro o produto"

### Etapa 1 — Configuração inicial guiada + cadastros melhores (M)
- Assistente de 4 passos no primeiro acesso: negócio e regime (MEI/Simples/outro), energia, primeira impressora, primeiro filamento, margem desejada. Preenche `cost_settings`.
- Impressora: preço, vida útil, valor residual → **depreciação por hora calculada** (editável); manutenção.
- Filamento: **carretéis** (peso inicial, saldo, preço pago) e ajuste manual de estoque.
- **Aceite:** conta nova chega ao primeiro preço calculado em poucos minutos, guiada; testes do cálculo de depreciação; RLS das novas tabelas.

### Etapa 2 — Importação de arquivo 3MF/G-code (G) — **implementada (validar com arquivos reais); ver `docs/IMPORTADOR.md`**
- Upload privado (Storage com RLS por usuário), parser, perfis de impressão detectados, escolha do perfil, **preenchimento automático** de peso/tempo na calculadora.
- Cada dado importado guarda `origem` (arquivo 3MF, G-code, manual) e vira campo editável.
- Aviso "este tempo foi fatiado para **outra impressora**" (seção 5.3).
- STL sem fatiamento: tela própria, sem inventar tempo/peso.
- **Aceite:** parser validado com **arquivos reais** (seção 5.2); testes com fixtures; nenhum campo ausente é preenchido por suposição.

### Etapa 3 — Calculadora v2 + canais de venda (G)
- Refatoração da calculadora (seção 3) e motor v2 (vários materiais).
- Canais cadastráveis (venda direta, marketplaces): taxa %, taxa fixa, imposto. **Sem valores de marketplace embutidos** — mudam com frequência; você informa e eu deixo claro de onde veio.
- Simulação lado a lado: mesmo custo, preço e lucro em cada canal; margem × markup comparados.
- **Aceite:** casos conferidos à mão, snapshots v1 ainda abrem, E2E do fluxo completo.

### Etapa 4 — Catálogo (M)
- Fotos (Storage), SKU, descrição, canal e perfil de impressão vinculados; histórico de preços já existente.
- **Aceite:** upload seguro (RLS de Storage testado), limites por plano.

## Versão comercial

### Etapa 5 — Orçamentos em PDF (G)
- Orçamento com itens do catálogo, validade, dados do negócio, PDF profissional, link de compartilhamento revogável.
- **Aceite:** PDF revisado visualmente; teste de isolamento entre clientes.

### Etapa 6 — Assinaturas e cobrança (G)
- Gateway (decisão sua: seção 7), webhook assinado e idempotente (`billing_events`), teste grátis, bloqueio por status, portal da assinatura.
- Limites por plano: impressoras, produtos, importações/mês, orçamentos/mês, PDF sem marca.
- **Aceite:** eventos de teste do gateway, reprocessamento seguro, nenhuma liberação só no frontend.

### Etapa 7 — Superadmin (M)
- Usuários, planos, métricas, suporte com ação auditada. (Seu usuário já é superadmin.)

### Etapa 8 — Importação por link do MakerWorld (M, condicional)
- Só após o spike (seção 5.1). Se não for viável/permitido, o fluxo vira "cole o link → o app orienta baixar o 3MF e arrastar" (assistido), guardando o link como origem.

### Etapa 9 — Lançamento (M)
- Domínio e hospedagem, Supabase pago com backups, e-mail transacional, termos/privacidade (LGPD: exportar e excluir conta), observabilidade, PWA.

## Melhorias futuras
- **Pedidos e fila de produção** (status, prazos, consumo automático de estoque ao concluir).
- Estimativa de peso a partir de STL (volume × densidade × preenchimento), sempre rotulada "estimativa" e editável.
- Equipes/organizações (vários usuários por conta).
- Integração com APIs de marketplaces; relatórios de lucro por período; modo escuro.

---

## 5. Importação — estratégia e riscos

### 5.1 Link do MakerWorld (honesto)
- Não há API pública oficial confirmada; **não vou presumir**. Do meu ambiente não alcanço o site (bloqueio de rede), então hoje não sei se a página pública expõe peso/tempo por perfil, se exige JavaScript ou login, se há proteção contra robôs, nem o que os termos de uso permitem.
- Spike antes de qualquer código: (a) ler termos e `robots.txt`; (b) ver se há endpoint documentado; (c) medir se peso/tempo estão acessíveis. Resultado do spike decide a Etapa 8.
- Arquitetura (já prevista): `src/connectors/<site>/` isolado, interface comum, resultado tipado (nunca exceção), campo ausente = `undefined`, cache e limite de taxa.
- Fallback sempre disponível: arquivo 3MF + entrada manual.

### 5.2 3MF e G-code
- G-code: cabeçalhos em comentário (tempo estimado, filamento usado) variam por fatiador (Bambu Studio/Orca/Prusa/Cura).
- 3MF é um ZIP; arquivos fatiados trazem metadados de placa/filamento; o formato exato varia por fatiador e versão.
- **Não vou escrever o parser de memória.** Preciso de amostras reais: 1) um 3MF baixado do MakerWorld com perfil de impressão; 2) um 3MF ou G-code fatiado em Bambu Studio/Orca/Prusa. Eu também tentarei obter arquivos de teste de código aberto; a validação final é com os seus.
- Dependência nova provável: biblioteca pequena de descompactação ZIP (justificativa: 3MF é ZIP).

### 5.3 "Tempo de outra impressora"
- O perfil guarda `impressora_do_arquivo` (texto lido do arquivo) e a impressora escolhida pelo usuário.
- Se diferem: aviso claro e persistente, **sem converter automaticamente**; o usuário pode (a) manter o valor, (b) editar tempo/peso, (c) aplicar um fator de ajuste que ele mesmo define. A origem fica registrada no snapshot do preço.

---

## 6. Dados, identidade visual e navegação

### 6.1 Modelo de dados (proposta; resumo)
- `printers`: + valor residual, vida útil já existe, manutenção.
- `filament_spools(id, filament_id, peso_inicial_g, saldo_g, preço_pago, status)` e `stock_movements(spool_id, delta_g, motivo, referência)`.
- `imported_models(id, origem, source_url, título, arquivo_path, licença/observação)`.
- `print_profiles(id, model_id, nome, origem[3mf|gcode|link|manual], impressora_do_arquivo, tipo_filamento, peso_g, tempo_min, é_estimativa, campos_editados jsonb, meta_bruta jsonb)`.
- `sales_channels(id, nome, taxa_%, taxa_fixa, imposto_%, padrão)`.
- `products`: + sku, descrição, canal e perfil padrão; `product_photos(path, posição)`.
- `pricings`: + `channel_id`, `print_profile_id` (opcionais; snapshots v1 permanecem válidos).
- `quotes`, `quote_items`, `quote_shares` (token revogável).
- Futuro: `orders`, `order_items`, `production_jobs`.
- Todas com RLS por `user_id`, auditoria e limites por plano; cada tabela nova ganha teste em `supabase/tests`.

### 6.2 Identidade visual própria
Conceito: **o preço é construído camada por camada**, como uma impressão 3D.
- **Assinatura visual:** o resultado da calculadora vira uma *pilha de camadas* — cada custo (filamento, máquina, energia, mão de obra, taxas…) é uma camada empilhada até formar o preço, com o lucro como camada final destacada. Transparência financeira e identidade no mesmo elemento.
- **Marca:** já usa três camadas empilhadas; evoluir para um símbolo mais autoral.
- **Cores:** manter a base quente (papel `#f4efe6`, tinta, laranja de bico quente) por já ser distinta do padrão "SaaS azul/roxo"; adicionar paleta semântica sóbria para margem (saudável / atenção / abaixo da meta) e uma cor secundária fria para dados importados (ex.: verde-água), diferenciando "informado por você" de "importado".
- **Tipografia:** números sempre em fonte monoespaçada tabular; um título com personalidade (definir com protótipo, ver abaixo).
- **Microinterações:** barra de "fatiamento" ao importar arquivo; camadas que se empilham ao calcular; estados vazios ilustrados.
- **Entrega de design:** antes de implementar, protótipo navegável da calculadora v2 e do assistente inicial para você aprovar.

### 6.3 Navegação
Desktop: Início · Importar · Calculadora · Catálogo · Orçamentos · Cadastros (Impressoras, Filamentos, Canais) · Conta. Celular: 5 abas (Início, Importar, Calcular, Catálogo, Mais). Pedidos entra quando existir.

---

## 7. Decisões e ações suas (nenhuma é necessária hoje para aprovar este plano)

1. **Aprovar ou ajustar** este roadmap (ordem das etapas, o que entra no MVP).
2. **Referência de mercado:** liberar `calc3d.com.br` (e `makerworld.com` para o spike) na política de rede do ambiente — eu te guio no passo a passo — **ou** enviar prints de calculadora e planos.
3. **Amostras reais** para a Etapa 2: um 3MF do MakerWorld com perfil de impressão (você pode baixar com conta gratuita) e, se possível, um G-code/3MF fatiado.
4. **Planos e preços** do PrintUp: por quais limites cobrar (impressoras, produtos, importações/mês, orçamentos/mês, PDF sem marca) e faixas de preço.
5. **Gateway de pagamento** (para a Etapa 6): preferência (Stripe, Mercado Pago, Asaas, Pagar.me…) — define PIX/boleto/cartão.
6. **Regimes tributários** que o assistente deve oferecer (MEI, Simples Nacional, outro).
7. **Supabase:** abrir *Database → Advisors* e me mostrar o resultado; decidir quando migrar para plano pago e se quer recriar o projeto em São Paulo (mais fácil agora, antes de haver dados de clientes).
8. **Domínio/hospedagem** quando chegar à Etapa 9.
