# Split UI — build context is the REPO ROOT (pnpm workspace).
#
# The browser only ever talks to this origin; `/_split/*` is rewritten to the
# API at runtime (see next.config.js), so SPLIT_API_URL is a RUNTIME env, not a
# build arg. The API is not published — it is reachable only from inside the
# isolated overlay network.

FROM node:22-bookworm-slim AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

# Next resolves `rewrites()` at BUILD time and freezes the result into
# .next/routes-manifest.json, so SPLIT_API_URL has to be set here — setting it
# only in the running container leaves the proxy pointed at the build-time
# default (localhost:5051) and every /_split/* call 500s with ECONNREFUSED.
ARG SPLIT_API_URL=http://localhost:5051
ENV SPLIT_API_URL=$SPLIT_API_URL

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @peanut-split/ui build

FROM node:22-bookworm-slim AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder --chown=node:node /app /app
USER node
EXPOSE 3051

WORKDIR /app/apps/ui
CMD ["./node_modules/.bin/next", "start", "-p", "3051"]
