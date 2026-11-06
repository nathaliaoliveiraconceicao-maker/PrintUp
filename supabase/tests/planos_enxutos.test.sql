-- Roda depois da migration 0014.
do $$
begin
  if exists (select 1 from public.plans where code = 'starter') then raise exception 'FALHOU: plano Iniciante sem uso deveria ter sido removido'; end if;
  if exists (select 1 from public.plans where features ? 'reports' or features ? 'production_advanced') then raise exception 'FALHOU: recurso "em breve" ainda listado em algum plano'; end if;
  if (select limits from public.plans where code = 'business') <> '{"max_products":1000,"max_printers":10,"max_filaments":200,"max_imports_month":300,"max_pdf_month":500,"max_storage_mb":5000}'::jsonb then raise exception 'FALHOU: limites do Business'; end if;
  if exists (select 1 from public.plans p, jsonb_each(p.limits) l where p.code in ('gratuito','pro','business') and l.value = 'null'::jsonb) then raise exception 'FALHOU: plano público com limite ilimitado'; end if;
end $$;
select 'Planos enxutos OK' as resultado;
