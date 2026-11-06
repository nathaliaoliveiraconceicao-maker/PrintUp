# Catálogo compartilhável (vitrine para clientes)

Link público `/c/<token>` (sem login) com os produtos à venda: nome, foto, descrição, preço e disponibilidade. Dono gerencia em `/produtos/compartilhar`.

- Tabela `catalog_shares` (uma por usuário, RLS do dono, `anon` sem acesso). `token` = 128 bits aleatórios; "gerar novo link" invalida o anterior.
- Leitura anônima **só** pelas funções `public_catalog_info/items/photo(token…)` (SECURITY DEFINER, `EXECUTE` para `anon` — exceção deliberada à regra geral). Recebem o token, nunca ids de usuário, e devolvem campos fixos de vitrine: **nunca custo, margem ou lucro** (as colunas nem existem no retorno).
- Só entram produtos ativos, com preço e (por padrão) com estoque. Opções do dono: mostrar preços, mostrar sem estoque, título, link ativo/desativado.
- Fotos: o bucket `user-images` continua privado; a rota `/c/<token>/foto/<id>` confere no banco e entrega a imagem com a chave de servidor.
- Páginas com `noindex`. Testes: `supabase/tests/rls_catalogo_publico.test.sql` e fluxo em `e2e/smoke.cjs`.
