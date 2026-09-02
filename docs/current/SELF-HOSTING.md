# Self-hosting

## Support status

The repository contains a reproducible development/reference topology for one Next.js application
replica and PostgreSQL. It is **not yet a turnkey production distribution**. The Baseline below
passed a clean-machine build/run smoke test on 2 September 2026 (fresh clone, image build,
migrations, room creation). Still open: neutral assets, immutable releases, and a complete notice
bundle. A custom public origin is supported as described below.

## Baseline

Prerequisites: Docker with Compose, or Node 22 + pnpm 10.17.1 + PostgreSQL 16.

```bash
cd apps/web
cp .env.example .env
docker compose up --build
```

The application listens on port 3000 and the development database is published on host port 5433.
Serve the app at exactly the origin it was built for: the image bakes `NEXT_PUBLIC_BASE_URL`
(default `http://localhost:3000`) as its canonical origin and 308-redirects every request —
including the API — that arrives under any other host or port. Publishing the container on a
different port, or fronting it with another hostname, therefore requires passing the matching
`NEXT_PUBLIC_BASE_URL` build argument and rebuilding, as described under Configuration classes.
Do not expose that database port on a public host. The supplied Compose path explicitly starts with
`SEO_INDEXABLE=false` and `SPLIT_FX_MODE=static`: it neither advertises the official site's released
guides nor calls an FX service by default.

For local source development:

```bash
docker compose up -d db
pnpm install --ignore-workspace
pnpm exec prisma migrate dev
pnpm dev
```

## Configuration classes

| Class                | Examples                                            | When read                              |
| -------------------- | --------------------------------------------------- | -------------------------------------- |
| Required secret      | `DATABASE_URL`                                      | Runtime and migration startup          |
| Optional secret      | VAPID private key, OpenRouter/Gemini keys           | Runtime server only                    |
| Public build input   | PostHog/Sentry/VAPID public values                  | Build time; compiled into browser code |
| Optional runtime     | FX/import modes, proxy URLs, model choice           | Runtime server only                    |
| Official-host policy | SEO indexability and canonical publication controls | Do not copy blindly into a fork        |

`NEXT_PUBLIC_BASE_URL` is the product's single build-time origin. Set it to an exact HTTPS origin,
for example `https://split.example.org` or `https://split.example.org:8443`; do not include a path,
credentials, query string, or fragment. Plain HTTP is accepted only for loopback development such
as `http://localhost:3000`. Missing or invalid values fail back to `https://peanutsplit.com`, so
verify the built image before exposing it. `.env.example`, `Dockerfile`, and `docker-compose.yml`
still drift for some optional variables. Until a generated environment-contract check exists,
compare all three before enabling a feature. Changing any effective `NEXT_PUBLIC_*` value only at
runtime does nothing to an existing build; rebuild when this origin changes.

`NEXT_PUBLIC_FOSS_RELEASED` is a separate build-time publication switch. Leave it unset in a
private, incomplete, or locally modified snapshot. Set it to the literal `1` only when the exact
tree being built is publicly readable and carries its license, notices, security review, and these
self-hosting documents. It exposes `/source`, its footer/sitemap entry, and copy that makes positive
FOSS claims; it is not a generic indexing switch.

`NEXT_PUBLIC_BUILD_COMMIT` is optional and only sharpens the source link. Supply a lowercase
40-character commit and `/source` links the public tree at exactly that commit; leave it unset and
the page links the branch and says the branch moves. It is not required, on purpose: a value typed
into a deploy platform by hand goes stale on the very next deploy, and `/source` would then name the
wrong tree while calling it exact. A stale pin is a false statement; a branch link is a true, weaker
one. Set it only if your pipeline can derive it per build. A fork must point it at a commit in a
repository its own users can read — the string check cannot tell whether the commit resolves, so the
operator owns that.

The configured origin owns product metadata, room-share links, install handoff origin checks, and
the PWA manifest/service-worker surface. The reverse proxy must remove client-supplied `Host`/
`X-Forwarded-Host` values and supply the external authority consistently. Those headers are checked
only to decide whether a PWA response belongs to the configured authority and whether an official
compatibility alias needs canonicalisation; redirect destinations always come from the validated
configuration.

The Dockerfile is the official-host image and bakes `SEO_INDEXABLE=true`; running that image without
Compose inherits that value. A fork must pass `SEO_INDEXABLE=false` until host-neutral indexing and
canonical-origin work is complete. For live FX, set both `SPLIT_FX_MODE=connected` and an explicit
`SPLIT_FX_ENDPOINT=https://…`; the supplied static default is the only no-egress mode.

## Known limitations

- The Dockerfile currently forces the v2 surface on, even if Compose passes `0`; treat the advertised opt-out as ineffective.
- The supplied Compose network allows ordinary egress and publishes ports; it has no default-deny policy or proxy allowlist.
- Compose does not define CPU/memory limits, a read-only filesystem, secret management, TLS, or backups.
- SSE wakeups and rate limits are process-local. Run one app replica.
- The default database credentials are development-only.
- Static FX mode supports a limited built-in table. Connected mode needs an explicit endpoint, any required proxy, and egress.
- No supported semantic-version release or rollback matrix exists yet; pin an exact commit during evaluation.

## Production responsibilities

Before network exposure, add:

1. TLS and a reverse proxy with explicit trusted-host/forwarded-header policy;
2. private PostgreSQL networking and unique credentials;
3. a secret store and rotation procedure for every configured secret;
4. tested backups and restore drills;
5. resource limits, monitoring, alerting, and log redaction;
6. deliberate egress policy for FX, push, models, analytics, and errors;
7. user-facing privacy/security notices appropriate to the operator's jurisdiction and subprocessors.

## Upgrade and rollback

The container entrypoint runs `prisma migrate deploy`, then prunes feedback older than 90 days and
expired install handoffs, before starting Next. Therefore:

1. stop writes or take a consistent PostgreSQL backup;
2. record the current application commit/image digest and migration head;
3. test restore before upgrading important deployments;
4. start the new image and wait for `/readiness`;
5. run a create/read/export smoke test on a non-sensitive room;
6. restore the database if a migration cannot be reversed safely—an old image alone may not be enough.

`/healthcheck` proves the process is serving. `/readiness` is the stronger startup/dependency signal.

## Public-origin contract

The host-neutral implementation takes the explicit build-time origin above and never reflects an
arbitrary request host into product links or redirect destinations. Official Peanut Split aliases
canonicalise to the configured origin. Generated guide canonicals remain on
`https://peanutsplit.com`, and a fork must keep `SEO_INDEXABLE=false`; custom-origin support does not
give a fork ownership of the official guide corpus. Before release, smoke-test that product pages,
the manifest, service worker, icons, room-share URLs, install handoff, and official-alias redirects
all stay on the configured origin.
