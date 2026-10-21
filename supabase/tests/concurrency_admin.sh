#!/usr/bin/env bash
# Concorrência real de cupons: duas conexões resgatando o ÚLTIMO uso ao mesmo tempo (a primeira segura a transação por 1,5 s).
set -uo pipefail
DB="$1"
A='b0000000-0000-0000-0000-000000000001'
B='b0000000-0000-0000-0000-000000000002'
q() { psql -X -q -At -d "$DB" "$@"; }
as() { echo "set role authenticated; set request.jwt.claim.sub = '$1'; set request.jwt.claim.role = 'authenticated';"; }
fail() { echo "FALHOU (concorrência de cupons): $1"; exit 1; }

q -c "insert into auth.users (id, email) values ('$A', 'conc-a@exemplo.com'), ('$B', 'conc-b@exemplo.com')" >/dev/null
q -c "insert into coupons (code, plan_id, days, max_redemptions) select 'CONCORR-1', id, 7, 1 from plans where code = 'pro'" >/dev/null

( { as $A; echo "begin; select public.redeem_coupon('CONCORR-1'); select pg_sleep(1.5); commit;"; } | q > /tmp/cc1.$$ 2>&1 ) &
sleep 0.4
( { as $B; echo "begin; select public.redeem_coupon('CONCORR-1'); commit;"; } | q > /tmp/cc2.$$ 2>&1 ) &
wait
OK=$(cat /tmp/cc1.$$ /tmp/cc2.$$ | grep -c '"plan_code"')
ERR=$(cat /tmp/cc1.$$ /tmp/cc2.$$ | grep -c 'Código inválido ou expirado')
USOS=$(q -c "select count(*) from coupon_redemptions r join coupons c on c.id = r.coupon_id where c.code = 'CONCORR-1'")
CNT=$(q -c "select redeemed_count from coupons where code = 'CONCORR-1'")
[ "$OK" = "1" ] && [ "$ERR" = "1" ] || fail "esperava 1 resgate e 1 recusa (resgates=$OK recusas=$ERR)"
[ "$USOS" = "1" ] && [ "$CNT" = "1" ] || fail "cupom de 1 uso foi usado $USOS vez(es), contador=$CNT"

# Mesma pessoa, dois cliques simultâneos no mesmo cupom de vários usos: só um resgate.
q -c "insert into coupons (code, plan_id, days, max_redemptions) select 'CONCORR-2', id, 7, 10 from plans where code = 'pro'" >/dev/null
( { as $A; echo "begin; select public.redeem_coupon('CONCORR-2'); select pg_sleep(1.5); commit;"; } | q > /tmp/cc3.$$ 2>&1 ) &
sleep 0.4
( { as $A; echo "begin; select public.redeem_coupon('CONCORR-2'); commit;"; } | q > /tmp/cc4.$$ 2>&1 ) &
wait
USOS=$(q -c "select count(*) from coupon_redemptions r join coupons c on c.id = r.coupon_id where c.code = 'CONCORR-2'")
ERR=$(cat /tmp/cc3.$$ /tmp/cc4.$$ | grep -c 'Você já usou este código')
[ "$USOS" = "1" ] && [ "$ERR" = "1" ] || fail "duplo clique gerou $USOS resgates (recusas=$ERR)"
rm -f /tmp/cc*.$$
echo "Concorrência de cupons OK"
