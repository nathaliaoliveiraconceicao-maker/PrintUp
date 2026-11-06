-- Planos enxutos: só o que de fato funciona.
-- 1) "Iniciante" (desligado) é removido se ninguém o usa; senão só fica indisponível.
-- 2) Recursos que ainda não existem (produção avançada e relatórios) saem de todos os planos.
-- 3) Business com limites fixos (nada ilimitado), mesmos recursos do Pro.

delete from public.plans p
 where p.code = 'starter'
   and not exists (select 1 from public.subscriptions s where s.plan_id = p.id or s.pending_plan_id = p.id)
   and not exists (select 1 from public.billing_checkouts c where c.plan_id = p.id)
   and not exists (select 1 from public.coupons c where c.plan_id = p.id);
update public.plans set is_active = false, is_public = false where code = 'starter';

update public.plans set features = features - 'production_advanced' - 'reports';

update public.plans set
  limits = '{"max_products":1000,"max_printers":10,"max_filaments":200,"max_imports_month":300,"max_pdf_month":500,"max_storage_mb":5000}',
  features = '{"calculator":true,"import_models":true,"quotes":true,"pricing_history":true,"orders":true,"stock":true,"production":true}'
where code = 'business';
