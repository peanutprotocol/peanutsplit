# Peanut Split

Peanut Split is an accountless expense splitter maintained by Squirrel Labs. A room is its link:
share it with the group, choose names, add expenses, and record settlements without requiring an
account.

This tree is the history-free `apps/web` distribution. It deliberately excludes the private API,
operations, publisher/provenance machinery, adaptive/persona prototype artifacts, press material,
portraits, and private Git history. Private source provenance and human-clearance records are deliberately not distributed in
this tree. An official release publishes a separate, redacted receipt beside its immutable source
archive, keyed to the one public root commit and listing every distributable file hash. A tree with
no `LICENSE` or with an `UNLICENSED` package is review material, not a release.

## License and stewardship

A cleared release contains the unmodified GNU AGPLv3 text in `LICENSE` and records
`AGPL-3.0-or-later` in `apps/web/package.json`. Squirrel Labs is the sole upstream maintainer and pays
the official service's infrastructure, service, domain, and work-hour costs. External patches are
not solicited and have no review or merge promise; see [CONTRIBUTING.md](CONTRIBUTING.md).

The official peanutsplit.com service may show a small number of contextual Peanut references. That
is an official-host editorial choice, never a downstream license condition. A downstream operator
does not owe Peanut promotion. See [STEWARDSHIP.md](STEWARDSHIP.md) and
[TRADEMARKS.md](TRADEMARKS.md).

## Local web setup

Prerequisites: Node 22, pnpm 10.17.1, Docker, and Docker Compose.

```bash
cp apps/web/.env.example apps/web/.env
pnpm --dir apps/web install --frozen-lockfile
docker compose -f apps/web/docker-compose.yml up -d db
pnpm --dir apps/web exec prisma migrate dev
pnpm --dir apps/web dev
```

Open <http://localhost:3000>. The Compose file is a development baseline; read
[the self-hosting guide](docs/current/SELF-HOSTING.md) before exposing it to a network.

## Verification

```bash
pnpm --dir apps/web typecheck
pnpm --dir apps/web lint
pnpm --dir apps/web test
pnpm --dir apps/web build
```

The public-candidate workflow runs the release-safe gate. Database and browser prerequisites are in
[the testing guide](docs/current/TESTING.md).

## Documentation

- [Documentation index](docs/README.md)
- [Architecture](docs/current/ARCHITECTURE.md)
- [Data model](docs/current/DATA-MODEL.md)
- [HTTP surface](docs/current/API.md)
- [Security and data lifecycle](docs/current/SECURITY-MODEL.md)
- [Self-hosting](docs/current/SELF-HOSTING.md)
- [Licensing](docs/current/LICENSING.md)
