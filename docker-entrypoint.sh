#!/bin/sh
set -e

echo "→ applying migrations"
./node_modules/.bin/prisma migrate deploy

echo "→ starting server on :${PORT:-3000}"
exec node server.js
