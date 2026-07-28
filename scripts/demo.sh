#!/usr/bin/env bash
#
# Start both apps and seed a room that looks like a real trip, so there's
# something to click through rather than an empty create form.
#
#   ./scripts/demo.sh
#
# Leaves the API on :5051 and the web app on :3000, prints the room URL, and
# keeps running until you Ctrl-C. The seeding goes through apps/web's own API,
# because apps/web talks to its own database — apps/api is started so the demo
# matches `pnpm dev`, not because the room lives there.
set -uo pipefail
cd "$(dirname "$0")/.."

API=http://localhost:5051
WEB=http://localhost:3000
LOGS="${TMPDIR:-/tmp}/peanut-split-demo"
mkdir -p "$LOGS"

# The mono QA harness exports a DATABASE_URL pointing at the shared peanut_dev,
# and Prisma prefers the process env over the app's own .env.
run() { env -u DATABASE_URL "$@"; }

echo "→ starting api and web…"
run pnpm --filter @peanut-split/api dev > "$LOGS/api.log" 2>&1 &
API_PID=$!
run pnpm --dir apps/web dev > "$LOGS/web.log" 2>&1 &
WEB_PID=$!
trap 'kill $API_PID $WEB_PID 2>/dev/null; echo; echo "stopped."; exit 0' INT TERM

wait_for() { for _ in $(seq 1 "$2"); do curl -sf -o /dev/null -m 2 "$1" 2>/dev/null && return 0; done; return 1; }
wait_for "$API/health" 150      || { echo "api failed to start — see $LOGS/api.log"; exit 1; }
wait_for "$WEB/healthcheck" 250 || { echo "web failed to start — see $LOGS/web.log"; exit 1; }

j() { python3 -c "import sys,json;print(json.load(sys.stdin)$1)"; }
S=$WEB/api

CREATED=$(curl -s -X POST $S/rooms -H 'content-type: application/json' \
  -d '{"name":"Sailing trip Thailand","emoji":"⛵","currency":"EUR","creatorName":"K"}')
SLUG=$(printf '%s' "$CREATED" | j "['room']['slug']")
K=$(printf '%s' "$CREATED" | j "['memberId']")
TOKEN=$(printf '%s' "$CREATED" | j "['memberToken']")

mem() { curl -s -X POST $S/rooms/$SLUG/members -H 'content-type: application/json' \
  -d "{\"name\":\"$1\"}" | j "['memberId']"; }
ALICE=$(mem Alice); BOB=$(mem Bob); CHRIS=$(mem Chris)

# Two currencies on purpose — the FX line under a foreign expense is half the
# reason this room exists.
exp() { curl -s -o /dev/null -X POST $S/rooms/$SLUG/expenses \
  -H 'content-type: application/json' -H "x-member-token: $TOKEN" \
  -d "{\"description\":\"$1\",\"amountMinor\":\"$2\",\"currency\":\"$3\",\"splitMode\":\"EQUAL\",\"paidById\":\"$4\"}"; }
exp "Marina fees"     300000 THB "$BOB"
exp "Groceries"         7200 EUR "$ALICE"
exp "Skipper tip"      12000 EUR "$K"
exp "Dinner in Phuket"  9400 EUR "$CHRIS"
exp "Fuel"             45000 THB "$CHRIS"

# Record one suggested transfer as already settled through Peanut, so the room
# opens showing both states: someone still owes, someone already paid.
T=$(curl -s $S/rooms/$SLUG | python3 -c "
import sys,json
t=json.load(sys.stdin)['suggestedTransfers'][0]
print(t['fromId'], t['toId'], t['amountMinor'])")
curl -s -o /dev/null -X POST $S/rooms/$SLUG/settlements \
  -H 'content-type: application/json' -H "x-member-token: $TOKEN" \
  -d "{\"fromId\":\"$(echo $T|cut -d' ' -f1)\",\"toId\":\"$(echo $T|cut -d' ' -f2)\",\"amountMinor\":\"$(echo $T|cut -d' ' -f3)\",\"method\":\"peanut\",\"note\":\"paid with Peanut\"}"

cat <<TXT

  ready.

  room        $WEB/r/$SLUG
  new room    $WEB/new
  preview     $WEB/r/$SLUG/opengraph-image

  You arrive as a stranger — pick a name to join, or open it in a second
  browser to see two people in the same room.

  Ctrl-C to stop.
TXT
wait
