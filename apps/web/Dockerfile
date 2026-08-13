# syntax=docker/dockerfile:1

FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS base
RUN corepack enable && apk add --no-cache libc6-compat
WORKDIR /app

# ---- deps -------------------------------------------------------------------
FROM base AS deps
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

# ---- build ------------------------------------------------------------------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm exec prisma generate
# The build must not reach a live DB — a dummy URL satisfies Prisma's env check.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV NEXT_TELEMETRY_DISABLED=1
# NEXT_PUBLIC_* is inlined at build time — runtime env can't fix it later.
# Dokploy passes this as a Docker build arg (buildArgs in the app settings).
ARG NEXT_PUBLIC_BASE_URL=https://peanutsplit.com
ENV NEXT_PUBLIC_BASE_URL=$NEXT_PUBLIC_BASE_URL
ARG NEXT_PUBLIC_SPLIT_V2_ENABLED
# Receipt scanning is public from the 2026-08-05 release. Keep the ARG declared
# so the existing Dokploy build setting remains accepted, but bake the release
# on regardless of an absent/blank stale value. Rollback is this one-line revert
# plus the ordinary main deploy.
ENV NEXT_PUBLIC_SPLIT_V2_ENABLED=1
ARG NEXT_PUBLIC_LANDING_VARIANT
ENV NEXT_PUBLIC_LANDING_VARIANT=$NEXT_PUBLIC_LANDING_VARIANT
ARG NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_POSTHOG_KEY
ENV NEXT_PUBLIC_POSTHOG_KEY=$NEXT_PUBLIC_POSTHOG_KEY
ARG NEXT_PUBLIC_POSTHOG_HOST
ENV NEXT_PUBLIC_POSTHOG_HOST=$NEXT_PUBLIC_POSTHOG_HOST
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ENV NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY
RUN pnpm build

# ---- runtime ----------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# The nine reviewed guides are released to indexing, so the deployed image carries the flag rather
# than depending on a Dokploy env var nobody can see in this repo. Runtime, not a build ARG: it is
# read per request by the proxy, the guide metadata and the sitemap, and it is not client code.
# Setting SEO_INDEXABLE to anything else in Dokploy still wins and turns indexing off — which is
# the only direction runtime config is allowed to move it.
ENV SEO_INDEXABLE=true

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# The whole dep tree comes over because the boot-time `prisma migrate deploy`
# needs the prisma CLI + the generated client, and Next's standalone trace
# includes neither. Slimming this (prod-only prune) is a deploy-wave follow-up.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

# Next standalone server — overlays its own traced node_modules on top.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

COPY --chown=nextjs:nodejs docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

USER nextjs
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
