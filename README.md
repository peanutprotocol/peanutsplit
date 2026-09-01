# Peanut Split

Peanut Split is an accountless expense splitter. A room is its link: send it to a group, choose a
name, add expenses in any supported currency, and record settlements made with cash, a bank, or any
payment app.

## Publication status

Peanut Split is open source. Squirrel Labs Ltd is the granting entity. Code is `AGPL-3.0-or-later` ([`LICENSE`](LICENSE));
documentation, content and artwork are `CC-BY-4.0`; third-party material keeps its own terms. The
per-path map is [`REUSE.toml`](REUSE.toml), the notices are
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md), and the marks policy is
[`TRADEMARKS.md`](TRADEMARKS.md). Reasoning in
[the licensing decision](docs/current/LICENSING.md); evidence in
[the rights register](docs/current/RIGHTS-REGISTER.md).

The `/source` page and every FOSS claim on the live site stay behind `NEXT_PUBLIC_FOSS_RELEASED`
until the deployment is built from a public commit — see
[the rights register](docs/current/RIGHTS-REGISTER.md) for what is done and what is left.

The durable promise is about released software: recipients of an AGPL release keep the license
permissions to run, inspect, modify, and share that version, subject to the AGPL terms. It does not
guarantee that Squirrel Labs will operate `peanutsplit.com` forever, or that every future release or
hosted feature has the same terms.

## Stewardship

[Squirrel Labs](https://squirrellabs.dev/) is currently the sole upstream maintainer. Squirrel
Labs pays the project's costs, including infrastructure, domains, third-party services, and the work
hours spent building and maintaining the official service.

The official service may contain a bounded set of contextual Peanut references. They are an
official-host editorial choice, not a software-license condition: they must never block a task,
force a click, recur as nags, behave like spam, or make non-Peanut settlement worse. A downstream
operator will not owe Peanut promotion. The precise surface budget remains unpublished until final
maintainer approval; see [STEWARDSHIP.md](STEWARDSHIP.md).

This is a maintainer-led project, not a contributor-recruitment program. Bug and private security
reports are useful; unsolicited feature pull requests are not solicited and have no response,
review, or merge promise. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Current implementation

`apps/web` is the only request path proven to serve the current product. It is a Next.js application
whose route handlers talk directly to PostgreSQL schema `split` through its own Prisma client.

`apps/api` is a separate Fastify implementation with a different Prisma schema, `app`. The current
web application has no rewrite or request edge to it. Whether that component should be archived,
published separately, or developed again is an open maintainer decision; it is not part of the
documented self-host path.

```text
browser -> apps/web (Next pages + /api handlers) -> PostgreSQL schema split
                         |-> optional FX, push, analytics, error, and receipt-model services

apps/api (Fastify, schema app)                 no current request edge from apps/web
```

## Run the current product locally

Prerequisites: Node 22, pnpm 10.17.1, Docker, and Docker Compose. From the repository root:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
pnpm bootstrap
docker compose -f apps/web/docker-compose.yml up -d db
pnpm --dir apps/web exec prisma migrate dev
pnpm dev:web
```

The API environment copy is needed only because the root dependency bootstrap generates both Prisma
clients; it does not put `apps/api` on the current web request path or connect to that database.

Open <http://localhost:3000>. The supplied Compose file is a development baseline, not a hardened or
turnkey production deployment. Read [SELF-HOSTING.md](docs/current/SELF-HOSTING.md) before exposing it
to a network.

## Official documentation

- [Documentation index](docs/README.md)
- [Architecture](docs/current/ARCHITECTURE.md)
- [Data model](docs/current/DATA-MODEL.md)
- [HTTP surface](docs/current/API.md)
- [Security and data lifecycle](docs/current/SECURITY-MODEL.md)
- [Self-hosting](docs/current/SELF-HOSTING.md)
- [Testing](docs/current/TESTING.md)
- [Licensing decision](docs/current/LICENSING.md)
- [Rights register](docs/current/RIGHTS-REGISTER.md)

Current schema and route inventories are generated from source. Run:

```bash
# From the repository root, after `pnpm bootstrap`.
pnpm docs:generate
pnpm docs:check
```

Historical design documents remain useful context, but they are not current contracts. The docs
index labels that boundary explicitly.

## Verification

```bash
# From the repository root, after `pnpm bootstrap`.
pnpm typecheck
pnpm format:check
pnpm docs:check
pnpm test
```

Database integration and browser suites have additional prerequisites in
[TESTING.md](docs/current/TESTING.md). A green check does not itself clear copyright, asset,
privacy, or publication rights.
