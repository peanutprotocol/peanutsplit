# SEO domain decisions — historical handoff

> [!IMPORTANT]
> **Superseded on 2026-08-09.** The plan of record is
> [`mono/projects/peanut-split/domain-consolidation-2026-08-09.md`](https://github.com/peanutprotocol/mono/blob/main/projects/peanut-split/domain-consolidation-2026-08-09.md).
> Marketing and SEO are native mono content at `peanut.me/{locale}/split/*`;
> rooms, `/new`, and the PWA live at `split.peanut.me`; and
> `peanutsplit.com` is a redirect shell. There is no peanut.me rewrite to this
> app. Breaking compatibility is allowed for this pre-launch product; the one
> migration exception is preserving access to existing live `/r/*` rooms.

This document records the 2026-07-30 handoff and the transition that followed.
Keep it for decision history, but do not use its old rewrite proposal as an
implementation plan.

## Current contract

- Marketing/SEO → `peanut.me/{locale}/split/*`, rendered by mono's content
  system.
- Product → `split.peanut.me` (`/r/*`, `/new`, app and PWA surfaces).
- Legacy domain → `peanutsplit.com` remains registered as a redirect shell.

The marketing implementation, locale contract, rollout state, and redirect
mapping are owned by the linked mono plan.

## Historical proposal (2026-07-30; superseded)

The rationale was to consolidate authority on peanut.me paths rather than a
subdomain or separate domain. That rationale survives, but the proposed serving
mechanism does not.

1. Indexable content was intended to serve on `peanut.me/split/*`.
2. The proposed serving mechanism was a peanut.me rewrite/reverse proxy to this
   standalone Next app. **This was never the final architecture and must not be
   implemented.** Mono now owns and renders the pages directly.
3. The app surface was to stay on `split.peanut.me`; this part remains current.
4. `peanutsplit.com` was described as landing-page-only. It is now a redirect
   shell instead.
5. The proposal limited peanut.me to curated, high-quality pages. Treat that as
   historical product reasoning; current content policy lives in mono.

## Historical state at the 2026-07-30 handoff

- Engine: standalone Next app, this repo (`apps/web`), MDX content in `src/content/` (~8 pages: blog + alternatives, en/es/pt-br).
- `metadataBase` comes from siteUrl env (`src/app/layout.tsx:17`) — domain switch is config, not code.
- A peanut.me-side rewrite had not been configured. The rewrite was later
  abandoned in favor of native mono content.

## Superseded open items

- ~~Add a `peanut.me/split/*` rewrite to this app.~~ Rejected; mono renders the
  content natively.
- ~~Point this app's content canonicals and sitemap at peanut.me.~~ Replaced by
  mono's metadata and sitemap implementation.
- Redirect legacy marketing paths to their native
  `peanut.me/{locale}/split/*` destinations as those destinations launch.
- Keep product/app routes on `split.peanut.me` out of the marketing index.

## Transition record — app cutover (2026-08-09 to 2026-08-10)

Decided 2026-08-09. Refines the 2026-07-30 rule; the authority argument stands unchanged.

- **Content → `peanut.me/{locale}/split/*`, owned by Konrad in mono's content engine.** The rewrite approach above is superseded for new content: curated pages are authored in mono, not proxied from this app.
- **App → `split.peanut.me`.** The cutover was implemented in this repo:
  `src/lib/domains.ts` (host pair), `src/lib/cutover-redirects.ts` (pure decision
  table), and `src/proxy.ts` (host-aware redirects). `/handoff` and
  `/share-target` remained exempt to preserve origin-bound state.
- **peanutsplit.com → redirect shell.** Product-path redirects were hardened
  from 302 to 301 on 2026-08-10. Marketing redirects are flipped per path as
  native peanut.me pages launch.
- **Interim canonical wart (historical):** before the native pages moved,
  marketing pages on peanutsplit.com could emit split.peanut.me canonicals.
  This was accepted only as a temporary migration state, never as the target
  architecture.
- **Device state crossed origins via `/handoff`** (postMessage bridge,
  `src/lib/handoff.ts`) to protect the few existing rooms during the cutover.
  This is the deliberate exception to the otherwise breaking migration.
