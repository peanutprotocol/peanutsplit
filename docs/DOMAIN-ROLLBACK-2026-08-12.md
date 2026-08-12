# Domain rollback — 2026-08-12

## Outcome

Peanut Split has one canonical origin again: `https://peanutsplit.com`.

That origin owns the app, rooms, PWA identity, native content, canonical and Open
Graph URLs, JSON-LD, robots, sitemap, and newly shared room links.
`split.peanut.me` may remain in DNS and in the Dokploy host list, but it is only a
same-path compatibility redirect to `peanutsplit.com`. No DNS mutation is needed
for this rollback.

This record supersedes the 2026-08-09 app cutover and the 2026-08-11
Peanut-hosted content plan. The canonical decision is
[`apps/web/docs/SEO-DOMAIN-DECISIONS.md`](../apps/web/docs/SEO-DOMAIN-DECISIONS.md).

## Runtime changes

- Canonical production URL literals now live in `src/lib/domains.ts`.
- `src/lib/site.ts` accepts `NEXT_PUBLIC_BASE_URL` only for loopback development
  origins. A stale public Dokploy build argument cannot change production URL
  identity.
- `src/lib/canonical-redirect.ts` replaces the bidirectional cutover table.
  `split.peanut.me` and both `www` aliases use one-way 308 redirects; path and
  query are preserved. Health probes stay host-local.
- The alias redirect runs before the dark generated-content transport. Manifest,
  service-worker, and API paths are included so the alias cannot become a second
  app surface.
- `peanutsplit.com` is the PWA authority and its service worker no longer
  unregisters itself.
- Server-generated room URLs use the canonical site URL.
- The cross-origin localStorage handoff page/components/library, reinstall
  banner, and translation copy were deleted.

The cookie-backed iOS install handoff remains. It is a same-origin install-flow
feature, not domain migration machinery.

## Peanut UI boundary

No Split route, renderer, or SEO code from the attempted integration merged into
Peanut UI `main` or `dev`. Therefore there is no Peanut UI code revert.

Cleanup is administrative and configuration-only:

- close draft PR `peanut-ui#2671` unmerged and link this decision;
- note on superseded drafts that no Split route shipped;
- remove the inert Vercel/GitHub entries `SPLIT_CONTENT_ORIGIN` and
  `SPLIT_CONTENT_EDGE_MARKER` through the guarded rollback workflow;
- retain root-site IndexNow as a separate TODO rather than folding it into this
  rollback.

## Deliberately deferred, not deleted

The generated-content system is preserved as unfinished work:

- mono `split-content/**` sources and unpublished drafts;
- `apps/web/src/app/(split-content)/**`;
- `apps/web/src/components/split-content/**`;
- `apps/web/src/lib/split-content/**`;
- `apps/web/src/generated/seo/**`;
- the Split sitemap/publisher workflow and release attestation.

Those files still encode the rejected `peanut.me/{locale}/split/*` content origin
and `split.peanut.me` CTA origin. They are safe only because all release controls
remain dark/fail-closed. Retargeting requires one later producer-to-renderer
change and regenerated artifacts; hand-editing generated output is explicitly
out of scope.

## Verification record

The release is complete only when all of these are recorded as passing on the
shipped commit:

- typecheck, formatting/audits, unit/integration tests, and production build;
- focused domain, metadata, sitemap, PWA, and room-link tests;
- Chromium app/alias/PWA E2E, plus the V2 suite for regression coverage;
- production HTTP matrix for `/`, `/app`, `/new`, `/import`, `/r/*`, robots,
  sitemap, manifest, service worker, and probes;
- live metadata/canonical inspection and one real QA room share/join cycle;
- independent exact-commit review, followed by a fix-forward cycle for any
  failure.

The final shipped commit and concrete QA results are appended after deployment.
