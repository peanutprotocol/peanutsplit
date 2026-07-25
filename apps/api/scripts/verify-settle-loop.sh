#!/usr/bin/env bash
# End-to-end proof of the settle-with-Peanut loop against the real API + Postgres.
set -uo pipefail
API=http://localhost:5051/split
HOOK=http://localhost:5051/webhooks/peanut
SECRET=local-dev-secret
pass=0; fail=0
ok(){ if [ "$2" = "$3" ]; then echo "  PASS  $1 ($2)"; pass=$((pass+1)); else echo "  FAIL  $1 — expected $3, got $2"; fail=$((fail+1)); fi }

sign(){ python3 -c "
import hmac,hashlib,sys
print(hmac.new(b'$SECRET', sys.stdin.buffer.read(), hashlib.sha256).hexdigest())"; }

post_hook(){ # $1 = json body
  local sig; sig=$(printf '%s' "$1" | sign)
  curl -s -o /dev/null -w "%{http_code}" -X POST $HOOK -H 'content-type: application/json' -H "x-peanut-signature: $sig" -d "$1"
}

newroom(){ curl -s -X POST $API/rooms -H 'content-type: application/json' -d "{\"title\":\"$1\",\"baseCurrency\":\"EUR\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['slug'])"; }
mem(){ curl -s -X POST $API/rooms/$1/members -H 'content-type: application/json' -d "{\"displayName\":\"$2\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['createdMemberId'])"; }
expense(){ curl -s -o /dev/null -X POST $API/rooms/$1/expenses -H 'content-type: application/json' -d "{\"description\":\"Dinner\",\"amountMinor\":\"$4\",\"currency\":\"EUR\",\"splitKind\":\"EQUAL\",\"paidByMemberId\":\"$2\",\"participantMemberIds\":[\"$2\",\"$3\"]}"; }
intent(){ curl -s -X POST $API/rooms/$1/settle-intent -H 'content-type: application/json' -d "{\"fromMemberId\":\"$2\",\"toMemberId\":\"$3\",\"amountMinor\":\"$4\"}"; }
state(){ curl -s $API/rooms/$1; }
count_settlements(){ state "$1" | python3 -c "import sys,json;print(len(json.load(sys.stdin)['settlements']))"; }
peanut_settlements(){ state "$1" | python3 -c "import sys,json;print(len([s for s in json.load(sys.stdin)['settlements'] if s['method']=='PEANUT']))"; }
pending(){ state "$1" | python3 -c "import sys,json;print(len(json.load(sys.stdin)['pendingSettleIntents']))"; }

echo "=== 1. happy path: intent -> signed webhook -> verified receipt ==="
S=$(newroom "Happy"); A=$(mem $S Alice); B=$(mem $S Bob)
expense $S $B $A 4000            # Bob paid 40, split 2 ways -> Alice owes Bob 20
R=$(intent $S $A $B 2000)
REF=$(echo "$R" | python3 -c "import sys,json;print(json.load(sys.stdin)['reference'])")
PAYURL=$(echo "$R" | python3 -c "import sys,json;print(json.load(sys.stdin)['payUrl'])")
ok "intent returns an opaque reference" "$([ ${#REF} -ge 20 ] && echo yes || echo no)" "yes"
ok "reference does NOT leak the room slug" "$(echo "$PAYURL" | grep -qF "$S" && echo leaked || echo clean)" "clean"
ok "pay URL carries the reference" "$(echo "$PAYURL" | grep -qF "$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1],safe=''))" "$REF")" && echo yes || echo no)" "yes"
ok "room shows the payment in flight" "$(pending $S)" "1"
ok "webhook accepted" "$(post_hook "{\"paymentId\":\"pay_A\",\"reference\":\"$REF\",\"amountMinor\":\"2000\",\"currency\":\"EUR\",\"status\":\"completed\"}")" "200"
ok "settlement recorded as PEANUT" "$(peanut_settlements $S)" "1"
ok "pending cleared" "$(pending $S)" "0"
ok "balances settled" "$(state $S | python3 -c "import sys,json;print(sum(abs(int(b['netMinor'])) for b in json.load(sys.stdin)['balances']))")" "0"

echo "=== 2. duplicate webhook records once ==="
ok "same payment id again" "$(post_hook "{\"paymentId\":\"pay_A\",\"reference\":\"$REF\",\"amountMinor\":\"2000\",\"currency\":\"EUR\",\"status\":\"completed\"}")" "200"
ok "still one settlement" "$(count_settlements $S)" "1"

echo "=== 3. THE regression: balances change mid-flight, payment must STILL record ==="
S2=$(newroom "Midflight"); A2=$(mem $S2 Alice); B2=$(mem $S2 Bob); C2=$(mem $S2 Carol)
curl -s -o /dev/null -X POST $API/rooms/$S2/expenses -H 'content-type: application/json' -d "{\"description\":\"Villa\",\"amountMinor\":\"9000\",\"currency\":\"EUR\",\"splitKind\":\"EQUAL\",\"paidByMemberId\":\"$B2\"}"
R2=$(intent $S2 $A2 $B2 3000); REF2=$(echo "$R2" | python3 -c "import sys,json;print(json.load(sys.stdin)['reference'])")
# While Alice is paying, Carol settles her share by hand -> Bob is owed less.
curl -s -o /dev/null -X POST $API/rooms/$S2/settlements -H 'content-type: application/json' -d "{\"fromMemberId\":\"$C2\",\"toMemberId\":\"$B2\",\"amountMinor\":\"3000\",\"method\":\"MANUAL\"}"
ok "Alice's confirmed payment still accepted" "$(post_hook "{\"paymentId\":\"pay_B\",\"reference\":\"$REF2\",\"amountMinor\":\"3000\",\"currency\":\"EUR\",\"status\":\"completed\"}")" "200"
ok "and it IS recorded (money moved, ledger agrees)" "$(peanut_settlements $S2)" "1"

echo "=== 4. forgery and tampering ==="
S3=$(newroom "Forgery"); A3=$(mem $S3 Alice); B3=$(mem $S3 Bob)
expense $S3 $B3 $A3 4000
R3=$(intent $S3 $A3 $B3 2000); REF3=$(echo "$R3" | python3 -c "import sys,json;print(json.load(sys.stdin)['reference'])")
BODY="{\"paymentId\":\"pay_C\",\"reference\":\"$REF3\",\"amountMinor\":\"2000\",\"currency\":\"EUR\",\"status\":\"completed\"}"
ok "unsigned webhook rejected" "$(curl -s -o /dev/null -w '%{http_code}' -X POST $HOOK -H 'content-type: application/json' -d "$BODY")" "401"
ok "wrong signature rejected" "$(curl -s -o /dev/null -w '%{http_code}' -X POST $HOOK -H 'content-type: application/json' -H 'x-peanut-signature: deadbeef' -d "$BODY")" "401"
SIG=$(printf '%s' "$BODY" | sign)
TAMPERED="{\"paymentId\":\"pay_C\",\"reference\":\"$REF3\",\"amountMinor\":\"500000\",\"currency\":\"EUR\",\"status\":\"completed\"}"
ok "body swapped after signing rejected" "$(curl -s -o /dev/null -w '%{http_code}' -X POST $HOOK -H 'content-type: application/json' -H "x-peanut-signature: $SIG" -d "$TAMPERED")" "401"
ok "no settlement from any of that" "$(count_settlements $S3)" "0"
ok "public route cannot claim method=PEANUT" "$(curl -s -o /dev/null -w '%{http_code}' -X POST $API/rooms/$S3/settlements -H 'content-type: application/json' -d "{\"fromMemberId\":\"$A3\",\"toMemberId\":\"$B3\",\"amountMinor\":\"2000\",\"method\":\"PEANUT\"}")" "400"
ok "public route cannot claim a peanut: idempotency key" "$(curl -s -o /dev/null -w '%{http_code}' -X POST $API/rooms/$S3/settlements -H 'content-type: application/json' -d "{\"fromMemberId\":\"$A3\",\"toMemberId\":\"$B3\",\"amountMinor\":\"2000\",\"idempotencyKey\":\"peanut:forged\"}")" "400"

echo "=== 5. payload that disagrees with the intent ==="
ok "amount mismatch not recorded" "$(post_hook "{\"paymentId\":\"pay_D\",\"reference\":\"$REF3\",\"amountMinor\":\"1\",\"currency\":\"EUR\",\"status\":\"completed\"}")" "200"
ok "  -> still no settlement" "$(count_settlements $S3)" "0"
ok "currency mismatch not recorded" "$(post_hook "{\"paymentId\":\"pay_E\",\"reference\":\"$REF3\",\"amountMinor\":\"2000\",\"currency\":\"USD\",\"status\":\"completed\"}")" "200"
ok "  -> still no settlement" "$(count_settlements $S3)" "0"
ok "non-completed status ignored" "$(post_hook "{\"paymentId\":\"pay_F\",\"reference\":\"$REF3\",\"amountMinor\":\"2000\",\"currency\":\"EUR\",\"status\":\"pending\"}")" "200"
ok "  -> still no settlement" "$(count_settlements $S3)" "0"
ok "unknown reference does not retry-loop" "$(post_hook "{\"paymentId\":\"pay_G\",\"reference\":\"nope\",\"amountMinor\":\"2000\",\"currency\":\"EUR\",\"status\":\"completed\"}")" "200"

echo
echo "passed=$pass failed=$fail"
[ "$fail" -eq 0 ]
