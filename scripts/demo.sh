#!/usr/bin/env bash
#
# Start both apps and seed a room that looks like a real trip, so there's
# something to click through rather than an empty create form.
#
#   ./scripts/demo.sh
#
# Leaves the API on :5051 and the UI on :3051, prints the room URL, and keeps
# running until you Ctrl-C.
set -uo pipefail
cd "$(dirname "$0")/.."

API=http://localhost:5051
UI=http://localhost:3051
SECRET="${PEANUT_WEBHOOK_SECRET:-local-dev-secret}"
LOGS="${TMPDIR:-/tmp}/peanut-split-demo"
mkdir -p "$LOGS"

# The mono QA harness exports a DATABASE_URL pointing at the shared peanut_dev,
# and Prisma prefers the process env over apps/api/.env.
run() { env -u DATABASE_URL "$@"; }

echo "→ starting api and ui…"
run pnpm --filter @peanut-split/api exec tsx watch src/index.ts > "$LOGS/api.log" 2>&1 &
API_PID=$!
run pnpm --filter @peanut-split/ui exec next dev -p 3051 > "$LOGS/ui.log" 2>&1 &
UI_PID=$!
trap 'kill $API_PID $UI_PID 2>/dev/null; echo; echo "stopped."; exit 0' INT TERM

wait_for() { for _ in $(seq 1 "$2"); do curl -sf -o /dev/null -m 2 "$1" 2>/dev/null && return 0; done; return 1; }
wait_for "$API/health" 150 || { echo "api failed to start — see $LOGS/api.log"; exit 1; }
wait_for "$UI/room" 250   || { echo "ui failed to start — see $LOGS/ui.log"; exit 1; }

j() { python3 -c "import sys,json;print(json.load(sys.stdin)$1)"; }
S=$API/split

SLUG=$(curl -s -X POST $S/rooms -H 'content-type: application/json' \
  -d '{"title":"Sailing trip Thailand","baseCurrency":"EUR"}' | j "['slug']")
mem() { curl -s -X POST $S/rooms/$SLUG/members -H 'content-type: application/json' \
  -d "{\"displayName\":\"$1\"}" | j "['createdMemberId']"; }
K=$(mem K); ALICE=$(mem Alice); BOB=$(mem Bob); CHRIS=$(mem Chris)

exp() { curl -s -o /dev/null -X POST $S/rooms/$SLUG/expenses -H 'content-type: application/json' \
  -d "{\"description\":\"$1\",\"amountMinor\":\"$2\",\"currency\":\"$3\",\"splitKind\":\"EQUAL\",\"paidByMemberId\":\"$4\",\"createdByMemberId\":\"$4\"}"; }
exp "Marina fees"     300000 THB "$BOB"
exp "Groceries"         7200 EUR "$ALICE"
exp "Skipper tip"      12000 EUR "$K"
exp "Dinner in Phuket"  9400 EUR "$CHRIS"
exp "Fuel"             45000 THB "$CHRIS"

# Put one confirmed Peanut receipt in the room by signing a callback the way
# Peanut is expected to, so the verified-receipt state is visible on arrival.
T=$(curl -s $S/rooms/$SLUG | python3 -c "
import sys,json
t=json.load(sys.stdin)['suggestedTransfers'][0]
print(t['fromMemberId'], t['toMemberId'], t['amountMinor'])")
REF=$(curl -s -X POST $S/rooms/$SLUG/settle-intent -H 'content-type: application/json' \
  -d "{\"fromMemberId\":\"$(echo $T|cut -d' ' -f1)\",\"toMemberId\":\"$(echo $T|cut -d' ' -f2)\",\"amountMinor\":\"$(echo $T|cut -d' ' -f3)\"}" | j "['reference']")
BODY="{\"paymentId\":\"pay_demo\",\"reference\":\"$REF\",\"amountMinor\":\"$(echo $T|cut -d' ' -f3)\",\"currency\":\"EUR\",\"status\":\"completed\"}"
SIG=$(printf '%s' "$BODY" | python3 -c "
import hmac,hashlib,sys,os
print(hmac.new(os.environ['SECRET'].encode(), sys.stdin.buffer.read(), hashlib.sha256).hexdigest())" )
SECRET="$SECRET" curl -s -o /dev/null -X POST $API/webhooks/peanut \
  -H 'content-type: application/json' -H "x-peanut-signature: $SIG" -d "$BODY"

cat <<TXT

  ready.

  room        $UI/room/$SLUG
  new room    $UI/room
  preview     $UI/room/$SLUG/opengraph-image

  You arrive as a stranger — pick a name to join, or open it in a second
  browser to see two people in the same room.

  Ctrl-C to stop.
TXT
wait
