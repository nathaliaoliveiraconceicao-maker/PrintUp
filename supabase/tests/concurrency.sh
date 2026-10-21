#!/usr/bin/env bash
# Concorrência real: duas conexões simultâneas disputando o mesmo estoque e o mesmo orçamento.
# Cada sessão segura a transação aberta por 1,5 s para garantir a sobreposição.
set -uo pipefail
DB="$1"
A='11111111-1111-1111-1111-111111111111'
ITEM='c0000000-0000-0000-0000-0000000000f2'
QUOTE='c0000000-0000-0000-0000-0000000000f3'
q() { psql -X -q -At -d "$DB" "$@"; }
as_a() { echo "set role authenticated; set request.jwt.claim.sub = '$A'; set request.jwt.claim.role = 'authenticated';"; }
fail() { echo "FALHOU (concorrência): $1"; exit 1; }

# Dois lotes de 600 g para uma bobina de 1000 g, criados sem reserva.
J=$( { as_a; echo "select public.create_job('$ITEM', 6, null, null, null, null, 0, 'sem_reserva');
select public.create_job('$ITEM', 6, null, null, null, null, 0, 'sem_reserva');"; } | q | grep -E '^[0-9a-f-]{36}$')
J1=$(echo "$J" | sed -n 1p); J2=$(echo "$J" | sed -n 2p)
[ -n "$J1" ] && [ -n "$J2" ] || fail "não criou os lotes"

# 1) Reservas simultâneas: só uma pode caber.
( { as_a; echo "begin; select public.reserve_job('$J1'); select pg_sleep(1.5); commit;"; } | q > /tmp/conc_r1.$$ 2>&1 ) &
sleep 0.4
( { as_a; echo "begin; select public.reserve_job('$J2'); commit;"; } | q > /tmp/conc_r2.$$ 2>&1 ) &
wait
OKS=$(cat /tmp/conc_r1.$$ /tmp/conc_r2.$$ | grep -c '^600')
ERRS=$(cat /tmp/conc_r1.$$ /tmp/conc_r2.$$ | grep -c 'Estoque insuficiente')
RES=$(q -c "select coalesce(sum(grams),0) from job_reservations where user_id = '$A'")
RSV=$(q -c "select reserved_g from filament_spools where user_id = '$A'")
[ "$OKS" = "1" ] && [ "$ERRS" = "1" ] || fail "esperava 1 reserva e 1 recusa por estoque insuficiente (ok=$OKS err=$ERRS)"
[ "${RES%.*}" = "600" ] && [ "${RSV%.*}" = "600" ] || fail "reservado deveria ser 600 g (reservas=$RES bobina=$RSV)"

# 2) Conclusões simultâneas da mesma tarefa: o consumo é baixado uma única vez.
JR=$(q -c "select job_id from job_reservations where user_id = '$A' limit 1")
( { as_a; echo "begin; select public.complete_job('$JR', 580, 100, null); select pg_sleep(1.2); commit;"; } | q > /tmp/conc_c1.$$ 2>&1 ) &
sleep 0.4
( { as_a; echo "begin; select public.complete_job('$JR', 580, 100, null); commit;"; } | q > /tmp/conc_c2.$$ 2>&1 ) &
wait
REM=$(q -c "select remaining_g from filament_spools where user_id = '$A'")
N=$(q -c "select count(*) from stock_movements where user_id = '$A' and kind = 'consumo'")
[ "${REM%.*}" = "420" ] || fail "saldo deveria ser 420 g, ficou $REM (consumo duplicado?)"
[ "$N" = "1" ] || fail "deveria haver 1 movimento de consumo, há $N"

# 3) Conversão simultânea do mesmo orçamento: um único pedido.
( { as_a; echo "begin; select public.convert_quote_to_order('$QUOTE'); select pg_sleep(1.2); commit;"; } | q > /tmp/conc_v1.$$ 2>&1 ) &
sleep 0.4
( { as_a; echo "begin; select public.convert_quote_to_order('$QUOTE'); commit;"; } | q > /tmp/conc_v2.$$ 2>&1 ) &
wait
NORD=$(q -c "select count(*) from orders where quote_id = '$QUOTE'")
CR=$(cat /tmp/conc_v1.$$ /tmp/conc_v2.$$ | grep -c '"created": true')
[ "$NORD" = "1" ] || fail "o orçamento gerou $NORD pedidos"
[ "$CR" = "1" ] || fail "apenas uma conversão deveria criar o pedido (criaram: $CR)"
rm -f /tmp/conc_*.$$
echo "Concorrência OK"
