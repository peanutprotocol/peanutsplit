# Peanut Split

Accountless, link-based expense splitting. Create a room, share the link, settle up however you
like — cash, bank, any app. Free forever, no signup, no KYC.

Architecture, data model, API contract and design rules: **[docs/SPEC.md](docs/SPEC.md)**.

## Local dev

```bash
cp .env.example .env
docker compose up -d db      # Postgres 16 on :5433
pnpm install
pnpm exec prisma migrate dev
pnpm dev                     # http://localhost:3000
```

Handler tests need their own database once: `createdb peanut_split_test` (or set
`TEST_DATABASE_URL`). `pnpm test` migrates it automatically on every run.

## Full stack in Docker

```bash
docker compose up --build    # app on :3000, migrations applied at boot
```

## Scripts

| Command          | What it does                  |
| ---------------- | ----------------------------- |
| `pnpm dev`       | Next dev server               |
| `pnpm build`     | Production build (standalone) |
| `pnpm start`     | Serve the production build    |
| `pnpm typecheck` | `tsc --noEmit`                |
| `pnpm lint`      | Prettier check                |
| `pnpm test`      | Vitest (unit)                 |
| `pnpm e2e`       | Playwright                    |
