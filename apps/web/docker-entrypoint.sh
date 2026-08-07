#!/bin/sh
set -e

# Migrations, with a bounded retry. A deploy rolls this container while Postgres
# may still be coming back from its own restart, and one blink at that moment
# kills the boot over a condition that clears in seconds. Ten attempts three
# seconds apart is half a minute of patience and then an honest failure — a
# container that starts without its schema would be far worse than one that
# refuses to start at all.
ATTEMPTS=10
DELAY=3

attempt=1
while true; do
    echo "→ applying migrations (attempt ${attempt}/${ATTEMPTS})"
    if ./node_modules/.bin/prisma migrate deploy; then
        break
    fi
    if [ "$attempt" -ge "$ATTEMPTS" ]; then
        echo "✗ migrations failed after ${ATTEMPTS} attempts — refusing to start"
        exit 1
    fi
    attempt=$((attempt + 1))
    sleep "$DELAY"
done

# Private feedback can contain a screenshot and room ledger context. Keep it
# only for the 90-day support window. The same cutoff runs before every new
# report; this boot sweep also covers a room that receives no later reports.
echo "→ pruning private feedback reports older than 90 days"
printf '%s\n' \
    'DELETE FROM "split"."FeedbackReport" WHERE "createdAt" < CURRENT_TIMESTAMP - INTERVAL '\''90 days'\'';' \
    | ./node_modules/.bin/prisma db execute --stdin --schema ./prisma/schema.prisma

echo "→ starting server on :${PORT:-3000}"
exec node server.js
