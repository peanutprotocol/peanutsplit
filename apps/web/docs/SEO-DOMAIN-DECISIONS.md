# SEO and product domain decision

Current decision: 2026-08-12. This supersedes the 2026-07-30 and 2026-08-09
multi-origin plans.

## The rule

`https://peanutsplit.com` is the one public identity for Peanut Split:

- app routes (`/app`, `/new`, `/import`, `/r/*`);
- PWA manifest, service worker, and install identity;
- native marketing and editorial pages;
- canonical, Open Graph, JSON-LD, robots, sitemap, and generated room links.

`https://split.peanut.me` is not a second app or canonical surface. Its DNS record
may remain for compatibility, but requests redirect one way, path-for-path, to
`https://peanutsplit.com`. Health probes are the only host-local exception.

## Runtime contract

- `src/lib/domains.ts` owns literal canonical and alias hosts.
- `src/lib/site.ts` permits a loopback origin for development and E2E only. A
  public `NEXT_PUBLIC_BASE_URL` build argument cannot override the canonical
  production origin.
- `src/lib/canonical-redirect.ts` and `src/proxy.ts` implement the one-way 308.
- `src/lib/seo.ts` builds every live native canonical and schema URL from
  `peanutsplit.com`.
- `src/lib/pwa-manifest.ts` publishes the install identity only for
  `peanutsplit.com`; the service worker remains active there.
- Old `split.peanut.me/r/*` links remain accepted by the room-link parser after
  they redirect.

The rejected cutover's cross-origin localStorage bridge, `/handoff` page,
reinstall banner, and `peanutsplit.com` service-worker retirement are removed.
The separate, same-origin iOS install handoff remains; it solves an install-flow
problem and is not domain-migration code.

## Generated-content work (deferred until 2026-08-13, now live)

The source-first pipeline in mono and the renderer/publisher code in this repo
are live: as of 2026-08-22 nine generated guides serve indexable at
`peanutsplit.com/{locale}/guides/*` and sit in the sitemap. Their earlier
`peanut.me/{locale}/split/*` and `split.peanut.me` URL contracts are historical
inputs, not live architecture. The scoped change that got them there had to:

1. choose `peanutsplit.com` paths for the generated pages;
2. retarget producer data, generated artifacts, renderer URL validation, sitemap,
   CTAs, and deployment configuration together;
3. regenerate artifacts rather than hand-editing generated files;
4. prove the pages without adding any Peanut UI route or proxy dependency.

Until then, release controls remain fail-closed and the native content under
`src/content/**` is the live SEO source.

## Superseded history

The 2026-08-09 cutover moved app intent to `split.peanut.me`, left marketing on
`peanutsplit.com`, and planned generated content under `peanut.me`. It introduced
bidirectional host routing, a browser-storage bridge, a reinstall prompt, and
service-worker retirement on `peanutsplit.com`. The product had no users, so the
2026-08-12 rollback deliberately chose clarity over carrying that migration
architecture forward. The old DNS record may stay because a redirecting alias
does not make it canonical.
