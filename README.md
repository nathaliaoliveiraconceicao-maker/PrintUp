# PrintUp

Precificação para quem vende peças impressas em 3D. Next.js + Supabase.

## Começando
1. Crie um projeto no Supabase e rode `supabase/migrations/0001_core.sql` (SQL Editor ou `supabase db push`).
2. `cp .env.example .env.local` e preencha URL e anon key.
3. Em Auth → URL Configuration, adicione `http://localhost:3000/auth/callback` aos redirects.
4. `npm install && npm run dev`

Veja `docs/PLANO.md` (arquitetura e etapas) e `CLAUDE.md` (convenções).
