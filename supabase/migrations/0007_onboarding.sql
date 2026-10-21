-- PrintUp · Etapa 4: configuração inicial guiada.
-- `onboarding_done_at` nulo = o usuário ainda não concluiu (nem pulou) o assistente de primeira utilização.
alter table public.profiles add column onboarding_done_at timestamptz;

-- Quem já usa o PrintUp não é levado de volta ao assistente.
update public.profiles set onboarding_done_at = now() where onboarding_done_at is null;
