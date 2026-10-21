#!/usr/bin/env bash
# Concorrência real de cotas e webhooks: duas conexões simultâneas, com a transação de uma segurada por 1,5 s.
set -uo pipefail
DB="$1"
G='77777777-7777-7777-7777-777777777777'
H='88888888-8888-8888-8888-888888888888'
q() { psql -X -q -At -d "$DB" "$@"; }
as() { echo "set role authenticated; set request.jwt.claim.sub = '$1'; set request.jwt.claim.role = 'authenticated';"; }
fail() { echo "FALHOU (concorrência de cobrança): $1"; exit 1; }

# 1) Limite de produtos (5 no Gratuito, G já tem 4): dois cadastros simultâneos — só um passa.
( { as $G; echo "begin; insert into public.products (name) values ('X1'); select pg_sleep(1.5); commit;"; } | q > /tmp/cb1.$$ 2>&1 ) &
sleep 0.4
( { as $G; echo "begin; insert into public.products (name) values ('X2'); commit;"; } | q > /tmp/cb2.$$ 2>&1 ) &
wait
N=$(q -c "select count(*) from products where user_id = '$G'")
ERRS=$(cat /tmp/cb1.$$ /tmp/cb2.$$ | grep -c 'Limite do plano atingido')
[ "$N" = "5" ] || fail "o Gratuito ficou com $N produtos (o limite é 5)"
[ "$ERRS" = "1" ] || fail "esperava exatamente 1 recusa por limite (houve $ERRS)"

# 2) Cota de PDF (1 por mês no teste): dois orçamentos diferentes ao mesmo tempo — só um consome.
q -c "update plans set limits = limits || '{\"max_pdf_month\":1}' where code = 'pro'" >/dev/null
( { as $H; echo "begin; select public.consume_quota('pdf_month', 'dddddddd-0000-0000-0000-0000000000b1'); select pg_sleep(1.5); commit;"; } | q > /tmp/cb3.$$ 2>&1 ) &
sleep 0.4
( { as $H; echo "begin; select public.consume_quota('pdf_month', 'dddddddd-0000-0000-0000-0000000000b2'); commit;"; } | q > /tmp/cb4.$$ 2>&1 ) &
wait
USED=$(q -c "select count(*) from usage_events where user_id = '$H'")
ERRS=$(cat /tmp/cb3.$$ /tmp/cb4.$$ | grep -c 'Limite do plano atingido')
[ "$USED" = "1" ] || fail "cota de PDF consumida $USED vezes (limite 1)"
[ "$ERRS" = "1" ] || fail "esperava 1 recusa por cota (houve $ERRS)"
q -c "update plans set limits = limits || '{\"max_pdf_month\":100}' where code = 'pro'" >/dev/null

# 3) Mesmo webhook entregue duas vezes ao mesmo tempo: um processa, o outro é duplicado; uma única assinatura/cobrança.
EV='{"gateway":"simulado","event_id":"evc1","type":"charge.confirmed","occurred_at":"2099-08-01T10:00:00Z","paid_at":"2099-08-01T10:00:00Z","gateway_subscription_id":"sub_G","gateway_charge_id":"ch_g","external_reference":"cccccccc-0000-0000-0000-0000000000e3","amount_cents":4990}'
( echo "begin; select public.apply_billing_event('$EV'); select pg_sleep(1.5); commit;" | q > /tmp/cb5.$$ 2>&1 ) &
sleep 0.4
( echo "begin; select public.apply_billing_event('$EV'); commit;" | q > /tmp/cb6.$$ 2>&1 ) &
wait
P=$(cat /tmp/cb5.$$ /tmp/cb6.$$ | grep -c '"processado"')
D=$(cat /tmp/cb5.$$ /tmp/cb6.$$ | grep -c '"duplicado"')
NS=$(q -c "select count(*) from subscriptions where user_id = '$G' and status = 'active'")
NC=$(q -c "select count(*) from billing_charges where gateway_charge_id = 'ch_g'")
[ "$P" = "1" ] && [ "$D" = "1" ] || fail "esperava 1 processado e 1 duplicado (processado=$P duplicado=$D)"
[ "$NS" = "1" ] && [ "$NC" = "1" ] || fail "o webhook duplicado criou assinaturas=$NS cobranças=$NC"
rm -f /tmp/cb*.$$
echo "Concorrência de cobrança OK"
