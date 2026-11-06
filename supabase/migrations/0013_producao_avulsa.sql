-- Registrar produção avulsa (sem pedido): baixa o filamento usado das bobinas e soma as peças prontas ao estoque do produto.
-- Tudo na mesma transação: ou baixa e soma, ou nada acontece. Saldos só mudam pelo livro-razão (stock_ledger_move).
-- Consome do que está DISPONÍVEL (saldo − reservado): nunca come material já prometido a pedidos.
-- Ordem: bobina em uso primeiro, depois a mais antiga. Idempotente pela chave (duplo clique não baixa duas vezes).

create or replace function public.register_production(p_product uuid, p_qty integer, p_filament uuid, p_grams numeric, p_key text)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); pr public.products; f public.filaments; s record;
  v_need numeric; v_avail numeric; v_take numeric; v_new_qty integer;
begin
  if v_uid is null then raise exception 'Sessão inválida' using errcode = '42501'; end if;
  if p_key is null or char_length(p_key) < 8 or char_length(p_key) > 80 then raise exception 'Chave inválida' using errcode = 'P0001'; end if;
  if p_qty is null or p_qty < 1 or p_qty > 100000 then raise exception 'Informe quantas peças foram produzidas' using errcode = 'P0001'; end if;
  if p_grams is null or round(p_grams, 2) <= 0 or p_grams > 1000000 then raise exception 'Informe os gramas de filamento usados' using errcode = 'P0001'; end if;

  select * into pr from public.products where id = p_product and user_id = v_uid and archived_at is null for update;
  if pr.id is null then raise exception 'Produto não encontrado' using errcode = 'P0002'; end if;
  select * into f from public.filaments where id = p_filament and user_id = v_uid;
  if f.id is null then raise exception 'Filamento não encontrado' using errcode = 'P0002'; end if;

  -- Repetição da mesma operação: não baixa de novo.
  if exists (select 1 from public.stock_movements where user_id = v_uid and idempotency_key like p_key || ':%') then
    return pr.stock_qty;
  end if;

  v_need := round(p_grams, 2);
  perform 1 from public.filament_spools where user_id = v_uid and filament_id = p_filament and status in ('nova', 'em_uso') order by id for update;
  select coalesce(sum(remaining_g - reserved_g), 0) into v_avail from public.filament_spools
    where user_id = v_uid and filament_id = p_filament and status in ('nova', 'em_uso') and remaining_g - reserved_g > 0;
  if v_avail < v_need - 0.004 then
    raise exception 'Estoque insuficiente: faltam % g de %', round(v_need - v_avail, 1), f.name using errcode = 'P0001';
  end if;

  for s in select * from public.filament_spools
           where user_id = v_uid and filament_id = p_filament and status in ('nova', 'em_uso') and remaining_g - reserved_g > 0
           order by (status = 'em_uso') desc, purchased_at nulls last, created_at, id loop
    v_take := least(v_need, s.remaining_g - s.reserved_g);
    perform public.stock_ledger_move(s.id, 'consumo', -v_take, 0, null, null, p_key || ':' || s.id::text,
      left('Produção avulsa: ' || p_qty || '× ' || pr.name, 300));
    v_need := v_need - v_take;
    exit when v_need <= 0.004;
  end loop;

  update public.products set stock_qty = stock_qty + p_qty where id = pr.id returning stock_qty into v_new_qty;
  return v_new_qty;
end $$;

revoke all on function public.register_production(uuid, integer, uuid, numeric, text) from public, anon;
grant execute on function public.register_production(uuid, integer, uuid, numeric, text) to authenticated;
