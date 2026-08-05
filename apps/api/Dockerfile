# Split API — build context is the REPO ROOT (pnpm workspace).
#
# Runs as a non-root user on a network with no gateway: the deployed container
# has one interface, no route off its own subnet, and can reach nothing but its
# Postgres and the proxy. Code here is treated as untrusted, so the image gives
# it no credentials beyond DATABASE_URL and no reason to need egress.

FROM node:22-bookworm-slim AS builder
WORKDIR /app

# openssl must be here too, not just in the runner. Prisma picks its engine
# binaries by sniffing the OpenSSL version at install time; with none present it
# silently settles on debian-openssl-1.1.x, and the runtime — which does have
# OpenSSL 3 — then tries to DOWNLOAD the 3.0.x engine on first boot. On a
# network with no gateway that download cannot happen, so the container
# crash-loops on `getaddrinfo EAI_AGAIN binaries.prisma.sh`. Pinning the target
# as well keeps this deterministic if the base image ever shifts.
ENV PRISMA_CLI_BINARY_TARGETS=debian-openssl-3.0.x
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.17.1 --activate

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
# Served through tsx, not `node dist/index.js`. The package is ESM and the
# TypeScript sources use extensionless relative imports (`import './app'`),
# which tsc emits verbatim — Node's ESM resolver rejects those, so the compiled
# output cannot start (ERR_MODULE_NOT_FOUND on dist/app). `pnpm build` is still
# run in the builder as a typecheck gate; fixing `start` properly means adding
# .js extensions across the API sources, which is the app's call, not the
# deploy's.
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && ./node_modules/.bin/tsx src/index.ts"]
