# Split API — build context is the REPO ROOT (pnpm workspace).
#
# Runs as a non-root user on a network with no gateway: the deployed container
# has one interface, no route off its own subnet, and can reach nothing but its
# Postgres and the proxy. Code here is treated as untrusted, so the image gives
# it no credentials beyond DATABASE_URL and no reason to need egress.

FROM node:22-bookworm-slim AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

# Whole-repo copy on purpose: the api's postinstall runs `prisma generate`, so
# the schema has to be present before install rather than after.
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @peanut-split/api build

FROM node:22-bookworm-slim AS runner
ENV NODE_ENV=production
WORKDIR /app

# openssl is Prisma's query-engine dependency; the slim base omits it.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder --chown=node:node /app /app
USER node
EXPOSE 5051

# Migrations run at boot with replicas pinned to 1, so there is no racing
# migrator. `migrate deploy` never generates or resets — it only applies what is
# already committed, and refuses rather than improvising if history diverges.
WORKDIR /app/apps/api
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && node dist/index.js"]
