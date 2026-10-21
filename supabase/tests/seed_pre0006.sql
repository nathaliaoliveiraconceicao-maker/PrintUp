-- Roda ANTES da migration 0006: produto legado criado a partir de uma precificação, para testar o preenchimento retroativo.
reset role; reset request.jwt.claim.sub; reset request.jwt.claim.role;
update public.subscriptions set trial_ends_at = now() + interval '5 days' where status = 'trialing';
insert into public.products (id, user_id, name) values ('eeeeeeee-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Produto legado');
insert into public.pricings (id, user_id, product_id, printer_name, quantity, pricing_mode, unit_cost, unit_price, unit_profit, margin_percent, markup_percent, input, result)
values ('eeeeeeee-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-000000000001',
  'Impressora X', 1, 'margin', 20.00, 40.00, 8.00, 20, 100,
  '{"filamentGramsPerUnit": 100, "printMinutesPerUnit": 120}',
  '{"unit": {"filament": 5, "machineHour": 6, "energy": 1, "wear": 2, "fixed": 1, "losses": 1.5, "labor": 3, "packaging": 0.5}}');
