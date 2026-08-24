# Current architecture

Validated against repository snapshot `c2ff861f013e8c3f16063ee5c41033f2c0098432` on 2026-08-24.
The request path and schema ownership below are derived from source; deployment claims outside the
repository are deliberately separated.

## Request and data flow

```text
browser / installed PWA
          |
          v
apps/web: Next.js pages, server rendering, and HTTP route handlers
          |
          +------> apps/web/src/server/* domain modules
          |                    |
          |                    v
          |          Prisma -> PostgreSQL schema split
          |
          +------> optional external services
                    FX endpoint / push gateways / receipt model
                    PostHog and Sentry in configured client builds

apps/api: separate Fastify service -> separate PostgreSQL schema app
          no current request or rewrite edge from apps/web
```

The current web request path is proven by:

- route handlers under `apps/web/src/app/**/route.ts`, including `/api`, operational, metadata, and room-card surfaces;
- direct imports from `apps/web/src/server/**`;
- the Prisma singleton in `apps/web/src/server/db.ts`;
- the absence of an API rewrite in `apps/web/next.config.js`.

## Component status

### `apps/web`

This is the current product and the only implementation covered by the current self-host guide.
Its canonical schema is `apps/web/prisma/schema.prisma`, PostgreSQL namespace `split`. Its own
migrations are the only migrations that prepare the current product database.

### `apps/api`

This is a separate Fastify implementation with PostgreSQL namespace `app`. It is still built and
tested, but the current web source does not call it. The evidence does not establish whether it is
deployed elsewhere or what its long-term status should be. Archive, removal, separate publication,
or renewed development requires an explicit maintainer decision.

Do not migrate `apps/api` and infer that the web product database is ready.

## Runtime properties

- The room slug is the primary bearer capability; there are no user accounts in the current product.
- One application replica is the documented baseline. SSE wakeups and rate-limit state are process-local.
- PostgreSQL is durable state. Browser-local state stores recent room links, member tokens, and offline writes.
- Build-time `NEXT_PUBLIC_*` values are compiled into client code. Changing them only at runtime has no effect.
- FX, push, receipt parsing, analytics, and error reporting are optional integrations with separate data flows.
- The container entrypoint applies database migrations before starting the server and runs retention pruning.

## Official-host versus repository baseline

The supplied `apps/web/docker-compose.yml` provides one web container and one PostgreSQL container
for development/reference use. It does not reproduce the official service's private network,
default-deny egress, reverse proxy, resource controls, secret store, monitoring, or backup system.
Those properties must never be implied by `docker compose up`.

See [SELF-HOSTING.md](SELF-HOSTING.md) and [SECURITY-MODEL.md](SECURITY-MODEL.md).
