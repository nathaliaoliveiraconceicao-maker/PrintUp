-- Quem cria conta entra direto no plano Gratuito e assina um plano pago depois, se quiser.
-- (Quem já está em teste mantém a data de fim; cupons de teste continuam funcionando.)
insert into public.platform_settings (key, value) values ('trial_enabled', 'false')
on conflict (key) do update set value = 'false', updated_at = now();
