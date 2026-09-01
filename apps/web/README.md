# Peanut Split web application

This Next.js application is the current Peanut Split product. Its route handlers use the Prisma
schema in [`prisma/schema.prisma`](prisma/schema.prisma) directly; no current request is proxied to
the separate Fastify application under `../api`.

The code is licensed `AGPL-3.0-or-later`, but the repository is still private, so this is not a public
FOSS release yet. See the root [publication status](../../README.md#publication-status).

## Local development

On a fresh clone, prepare the generate-time environment and run the split root bootstrap first:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
pnpm bootstrap
cd apps/web
```

The API environment copy satisfies its Prisma-client generation only; the current web request path
does not use that application. Then, from `apps/web`:

```bash
docker compose up -d db
pnpm exec prisma migrate dev
pnpm dev
```

Open <http://localhost:3000>. Handler tests need a separate database once:

```bash
docker compose exec -T db psql -U split -d postgres -c 'CREATE DATABASE peanut_split_test;'
pnpm test
```

The copied `.env` points tests at that Compose database. Set `TEST_DATABASE_URL` explicitly if it
uses another name or host. Vitest applies migrations before running. Browser setup, its separate
database, and exact commands are in the root [testing guide](../../docs/current/TESTING.md).

## Container baseline

```bash
docker compose up --build
```

This starts one application replica and PostgreSQL. It applies migrations and retention sweeps at
application startup. It is a development/reference topology: it does not include TLS, a reverse
proxy, default-deny egress, resource limits, secret management, backups, or the containment used by
the official service.

Read the root [self-hosting guide](../../docs/current/SELF-HOSTING.md) for the exact limitations,
build-time environment behavior, and upgrade precautions.

## Current contracts

- [Architecture](../../docs/current/ARCHITECTURE.md)
- [Data model](../../docs/current/DATA-MODEL.md)
- [HTTP surface](../../docs/current/API.md)
- [Security and data lifecycle](../../docs/current/SECURITY-MODEL.md)
- [`docs/SPEC.md`](docs/SPEC.md) — historical build brief only; do not implement it as the current contract

## Commands

| Command           | Purpose                                     |
| ----------------- | ------------------------------------------- |
| `pnpm dev`        | Start Next development server               |
| `pnpm build`      | Build the standalone production image input |
| `pnpm start`      | Serve a production build                    |
| `pnpm typecheck`  | Run TypeScript without emitting files       |
| `pnpm lint`       | Run formatting and Tailwind-class checks    |
| `pnpm test`       | Run Vitest suites                           |
| `pnpm i18n:audit` | Check message-catalog key parity            |
| `pnpm e2e`        | Run Playwright with its configured database |

The interface ships in `en`, `es-419`, `pt-br`, `pl`, `de`, `fr`, and `uk`. Room URLs do not contain
a locale: the request cookie, `Accept-Language`, and then English determine interface language.
