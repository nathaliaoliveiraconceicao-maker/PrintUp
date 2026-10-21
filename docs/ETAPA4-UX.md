# Etapa 4 — Painel e experiência do usuário

## Identidade visual
Grafite + laranja vibrante + neutros; marca nova (selo grafite com camadas laranja subindo), favicon SVG, foco visível, `prefers-reduced-motion` respeitado. Fonte: pilha do sistema (sem download de fontes: mais rápido, privado e sem falhar offline). Contrastes conferidos (AA): grafite sobre laranja 5,4:1; links laranja-escuro sobre branco 5,4:1; texto secundário 5,2:1.

## Painel (`/`)
Produtos cadastrados · orçamentos criados (com aguardando/rascunhos) · aprovados · valor aprovado · lucro estimado dos aprovados · produtos precificados recentemente · 6 atalhos. Estados vazios com orientação. **Orçado ≠ vendido:** o aviso fica na tela; não há faturamento real porque não existe módulo de vendas. O lucro estimado é "aprovado − custo de produção" (sem taxas/impostos) e só considera aprovados com custo conhecido; os demais são contados à parte.

## Calculadora
- **Rápido:** impressora, filamento, peso, tempo, unidades e margem. Os padrões (perdas, taxas, impostos, energia) já vêm das configurações.
- **Avançado:** potência, energia, depreciação + manutenção (um único valor R$/h, como o motor trata), custo/hora da máquina, custos fixos, mão de obra, perdas, embalagem, acabamento (soma com a embalagem), taxas, impostos, margem/markup e simulação de desconto. "Voltar aos padrões" desfaz os ajustes da impressora.
- Mesmo motor nos dois modos; trocar de modo não perde nem muda nada. Resultado: preço sugerido em destaque + custo do filamento, da impressora e adicionais, custo total/unitário/lote, lucro, margem, markup e gráfico de composição (a barra tem legenda e descrição para leitor de tela).
- Desconto ao cliente é só simulação: mostra preço, lucro e margem com desconto e alerta se der prejuízo; não muda o preço sugerido nem o que é salvo.

## Configuração inicial (`/boas-vindas`)
Negócio → impressora → custo da hora (informado ou calculado: preço ÷ vida útil) → filamento → margem padrão. Cada passo salva no Supabase ao continuar; "Pular este passo" não grava; "Configurar tudo depois" encerra. `profiles.onboarding_done_at` (migration 0007) evita que volte sozinho; usuários que já existem são marcados como concluídos. Refazer (Configurações → Configuração guiada) atualiza a primeira impressora/filamento em vez de duplicar.

## Navegação
Painel · Nova precificação · Importar modelo · Meus produtos · Orçamentos · Impressoras · Filamentos · Configurações (com abas: Custos e margens, Meu negócio, Histórico, Configuração guiada). Pedidos e Estoque aparecem como "em breve", sem link. Celular: barra inferior com Painel, Precificar, Produtos, Orçamentos e Mais.

## Limites conhecidos
- Sem teste automatizado com o Supabase real; o E2E usa um Supabase falso.
- Lucro estimado ignora taxas/impostos de venda e personalizações sem custo.
- Sem controle de contraste automatizado no CI (conferido manualmente na paleta).
