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

Three: `en` (default), `es` (es-419 tone), `pt-BR`. There is no `[locale]` URL segment and no
middleware — a room link is the product and a link that carries a language arrives in the wrong
one the moment it is forwarded. The locale comes from the `ps-locale` cookie, falling back to
`Accept-Language`, falling back to English, and is resolved in `src/i18n/request.ts` before
anything renders. The consequence, and it is deliberate: every route is server-rendered per
request, because no static HTML can be correct for three languages at once.

Strings live in `src/i18n/messages/{en,es,pt-BR}.json` and are read with `useTranslations`.
`pnpm i18n:audit` is the gate and runs in CI — a key that is missing renders as its own dotted
path, which throws nothing, fails no test, and ships.

Two surfaces stay English on purpose: the OG images (`src/server/og/`, whose fonts have no
accented glyphs) and the Splitwise comparison page (`components/marketing/copy.ts`, whose body
must match the English `<title>` and FAQPage JSON-LD a crawler is served). The shell around the
article pages — nav, footer, language switcher — is translated.
