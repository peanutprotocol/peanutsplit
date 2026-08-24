# Testing

Run all commands from the repository root. On a fresh clone, copy both example environment files
before `pnpm bootstrap`; bootstrap generates both Prisma clients even though `apps/api` is not on the
current web request path:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
pnpm bootstrap
```

The current web handler and browser suites use real, disposable PostgreSQL databases; neither should
point at production or a database containing useful rooms.

## Reference databases

Start the supplied PostgreSQL service and create the two disposable databases once:

```bash
docker compose -f apps/web/docker-compose.yml up -d db
docker compose -f apps/web/docker-compose.yml exec -T db \
  psql -U split -d postgres -c 'CREATE DATABASE peanut_split_test;'
docker compose -f apps/web/docker-compose.yml exec -T db \
  psql -U split -d postgres -c 'CREATE DATABASE peanut_split_dev;'
```

If either database already exists, PostgreSQL will reject only that create statement; do not drop a
database merely to repeat setup. The reference URLs are:

```text
TEST_DATABASE_URL=postgresql://split:split@localhost:5433/peanut_split_test
E2E_DATABASE_URL=postgresql://split:split@localhost:5433/peanut_split_dev
```

Use unique credentials and private networking outside local development.

## Static and handler checks

The standard root gate is:

```bash
TEST_DATABASE_URL=postgresql://split:split@localhost:5433/peanut_split_test pnpm test
```

It checks generated docs, the content publisher, the Fastify application, and the Next/Vitest
suites. The web global setup applies its migrations to `TEST_DATABASE_URL`. Test files deliberately
share one database and run without file-level parallelism.

Useful narrower checks are:

```bash
pnpm typecheck
pnpm format:check
pnpm docs:check
pnpm i18n:audit
pnpm marketing-copy:audit
```

## Browser journeys

Install the browser binary, migrate the separate E2E database, and pass its URL explicitly:

```bash
pnpm --dir apps/web exec playwright install chromium
DATABASE_URL=postgresql://split:split@localhost:5433/peanut_split_dev \
  pnpm --dir apps/web exec prisma migrate deploy
E2E_DATABASE_URL=postgresql://split:split@localhost:5433/peanut_split_dev \
  pnpm --dir apps/web e2e
```

`pnpm --dir apps/web e2e:v2` uses the same database but starts a feature-enabled build on a separate
port. The PWA-boundary suite is different: it expects an already running production build or hosted
candidate and does not start one automatically. Playwright may need host packages in addition to
the downloaded browser; CI uses `playwright install --with-deps` for that reason.

## Publication meaning

Passing tests proves only the checked implementation. It does not grant a license, clear file-level
rights, sanitize repository history, prove secure deployment, or authorize a FOSS/public claim.
