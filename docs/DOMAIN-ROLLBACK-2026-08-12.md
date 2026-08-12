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

Runtime release commit
[`541dce23549b3984343cc201dab52052957be18e`](https://github.com/peanutprotocol/peanutsplit/commit/541dce23549b3984343cc201dab52052957be18e)
was deployed and production-verified on 2026-08-12. Its
[GitHub Actions run](https://github.com/peanutprotocol/peanutsplit/actions/runs/31621703518)
passed both the complete check job and the exact-argument production Docker
build.

Before deployment, the local gate passed:

- bootstrap, typecheck, formatting and all source audits;
- 24 publisher, 80 API, and 2,406 web tests (two deliberately gated skips);
- the full production build, including 96 generated pages and the PWA build
  boundary;
- focused domain/SEO/PWA coverage, 50 relevant desktop journeys, 16 relevant
  mobile journeys, the social-preview journeys, and the production PWA-boundary
  test;
- an independent exact-commit review. It found an alias public-asset matcher
  gap, which was fixed before the release commit; the complete matrix passed on
  the corrected tree.

Production verification then passed twice, once by the shipping agent and once
by an independent agent:

- canonical `/`, `/app`, `/new`, `/import`, `/blog`, `/tools`, robots, sitemap,
  manifest, service worker, icons, and probes terminate on `peanutsplit.com`;
- `split.peanut.me` and `www.peanutsplit.com` make one query-preserving 308 hop
  to the same canonical path. Health and readiness probes stay host-local;
- canonical, Open Graph, hreflang, and JSON-LD URLs use only
  `peanutsplit.com`. The sitemap has 39 canonical `<loc>` entries and 135 total
  URL references, all on the canonical origin; robots advertises that sitemap;
- the manifest is `Split` with `id: /`, `start_url: /app`, and `scope: /`. A
  persistent headed Chrome profile reported zero installability errors on the
  app, a redacted QA room, and its recap; each page was service-worker
  controlled and received `beforeinstallprompt`;
- a disposable production room was created through the mobile UI, joined by a
  second member, and given an expense. The API returned two members and one
  expense, the visible/share URL used `peanutsplit.com`, the room was noindex,
  and both aliases redirected its exact path and query;
- `peanut.me` root, robots, sitemap, and sampled Split-looking paths remained
  ordinary Peanut surfaces with no Split marker, origin, sitemap, or renderer.

The live share journey also exposed an E2E-only assumption: its manual-copy
assertion required a localhost URL even when intentionally pointed at
production. The follow-up makes the assertion compare against the exact URL
already captured from the share payload. It passes against production. A broad
money journey separately reached the live FX path and differed from its static
local-rate fixture; the same-currency production ledger journey passed, so no
money behavior was changed as part of this rollback.

Peanut UI required no code revert. Draft PRs stayed unmerged; #2671 was closed,
and corrective notes were added to #2670 and #2590. Guarded workflow runs
[`31622150493`](https://github.com/peanutprotocol/peanut-ui/actions/runs/31622150493)
and
[`31622185549`](https://github.com/peanutprotocol/peanut-ui/actions/runs/31622185549)
removed the two inert Vercel Production records and independently proved them
absent before their GitHub source variable and secret were deleted. DNS was not
changed.
