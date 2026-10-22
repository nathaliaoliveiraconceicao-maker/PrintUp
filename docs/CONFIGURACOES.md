# Configurações (custos e preço) — feitas uma vez

Tudo o que a calculadora usa em **todos** os cálculos fica em `/configuracoes` (tabela `cost_settings` + `sales_channels`, migration `0011`).

1. **Impressão e materiais**: energia (R$/kWh), mão de obra (R$/h), embalagem e frete por peça. Potência/preço/vida útil ficam na impressora; preço/kg no filamento.
2. **Despesas mensais**: aluguel, softwares, plataformas, tributos fixos, publicidade, condomínio e outros (`fixed_items`, chaves em lista fixa validada por trigger). `monthly_fixed_costs` é a soma, calculada no servidor. Não incluir energia nem desgaste (já por peça).
3. **Rateio**: `revenue_percent` (despesas ÷ faturamento previsto, aplicado sobre o custo variável — o método do Precificador antigo), `per_hour` ou `per_unit`.
4. **Preço**: margem sobre o preço ou multiplicador do custo (guardado como `markup_percent`; 3× = 200%), perdas, impostos, taxa da venda direta e arredondamento para o próximo real (`price_rounding`).
5. **Canais de venda** (`sales_channels`, até 10, RLS por usuário): cada um com taxa % e fixa. A calculadora recalcula o preço trocando só as taxas da venda direta pelas do canal, mantendo a margem. O PrintUp **não** traz taxas "oficiais" da Shopee/Mercado Livre: variam por categoria, preço e campanha, então quem informa é o usuário.

Mudar configurações **não** altera produtos nem orçamentos já salvos (ver `recalculateProducts`). O motor passou a `PRICING_ENGINE_VERSION = 2` (novo rateio e arredondamento; entradas antigas continuam válidas).
