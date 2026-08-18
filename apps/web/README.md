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

| Command           | What it does                  |
| ----------------- | ----------------------------- |
| `pnpm dev`        | Next dev server               |
| `pnpm build`      | Production build (standalone) |
| `pnpm start`      | Serve the production build    |
| `pnpm typecheck`  | `tsc --noEmit`                |
| `pnpm lint`       | Prettier check                |
| `pnpm test`       | Vitest (unit)                 |
| `pnpm i18n:audit` | Message-catalog key parity    |
| `pnpm e2e`        | Playwright                    |

## Languages

The product UI ships in `en` (default), `es-419`, `pt-br`, `pl`, `de`, `fr`, and `uk`. Room and
app URLs have no locale segment — a room link is the product, and a forwarded link should open in
the recipient's language. The locale comes from the `ps-locale` cookie, then `Accept-Language`,
then English, and is resolved in `src/i18n/request.ts` before anything renders. Authored SEO and
guide pages use locale-prefixed URLs only where the translated content exists.

Strings live in `src/i18n/messages/*.json` and are read with `useTranslations`.
`pnpm i18n:audit` is the gate and runs in CI — a key that is missing renders as its own dotted
path, which throws nothing, fails no test, and ships.

Room unfurls and share cards are localized. Their pinned Knerd/Roboto font pipeline preserves the
Latin Extended and Cyrillic catalogs without a runtime font fetch.
