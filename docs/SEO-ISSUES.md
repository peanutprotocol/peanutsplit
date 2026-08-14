# SEO issues — audit tracker

Opened 2026-08-14 from a 14-agent audit of peanutsplit.com: 7 auditors (live HTTP I/O,
metadata/hreflang, structured data, engine code, production pipeline, landing page, crawl
graph), each finding reproduced by an independent read-only verifier before it counts.
49 confirmed, 1 refuted. Full evidence, verifier notes, and severity rationale:
https://claude.ai/code/artifact/f82fc8b2-cc4c-4241-b173-24268d110c7e

Companion files, read together:

- mono `projects/peanut-split/guides-seo-tracker.md` — execution state for the generated
  guides. Its open items 3 (blog FX claim), 4 (sitemap submission), 5 (`SEO_INDEXABLE`)
  and 7 (dead path builders) recur below with audit evidence.
- [`../apps/web/docs/SEO-DOMAIN-DECISIONS.md`](../apps/web/docs/SEO-DOMAIN-DECISIONS.md) — domain decisions (2026-08-12, current).
- [`SEO-PLAN.md`](SEO-PLAN.md) and mono `projects/peanut-split/seo-backlog.md` — historical.

Check a box only after you verified the fix on production (mono
`projects/peanut-split/guides-seo-tracker.md` has the verify commands).

## Baseline verified healthy 2026-08-14

Do not re-audit these on sight: all 48 sitemap URLs answer 200 in one hop; bogus slugs
return real 404s (no soft-200, no 500); http→https, www→apex, trailing-slash and legacy
`/es/`→`/es-419/` redirects are single-hop; `og:image` resolves 200 for every page type;
parked guides serve 200 + `noindex, nofollow, noarchive`; robots.txt serves the designed
ruleset; the landing hero serves the room composer.

## Fix first

- [ ] **1. Wrong FX claim on the indexed page** — medium, money truth. `apps/web/src/content/blog/split-expenses-across-currencies/en.md:35`
  says the rate is "not locked for the whole trip". `split-content/product/truths.md` says
  the rate is frozen onto the expense at creation. The 13 Aug correction landed only on the
  noindexed guide twin. Reword the line to the truths.md framing. One file.
  (= guides-seo-tracker item 3.)
- [ ] **2. Claims IDs are unenforced for the native corpus** — high. Stylebook §7.5 says a
  claim with no ID does not ship; no content page carries `claims:`/`competitorClaims:`,
  the `Frontmatter` interface (`apps/web/src/lib/content.ts:63`) discards the keys, and no
  test resolves an ID. The generated pipeline enforces this (mono
  `scripts/split-content.mjs:939`) — port that gate: add the keys to `Frontmatter`, require
  them per §11.3 by type, resolve every ID against `_system/product-truths.md` and
  `_system/competitor-claims.md` in `content.test.ts`.
- [ ] **3. hreflang advertises drafts** — medium. `localesForSlug`
  (`apps/web/src/lib/content.ts:137`) gates on file presence only, so a committed
  `published: false` (or unparseable) translation enters page hreflang and sitemap
  alternates while its route 404s. Trap: `content.test.ts:999-1022` uses `localesForSlug`
  as its own oracle, so the suite asserts the bug — the fix must also invert that test.
  Derive alternates from published docs (the split-content engine already does:
  `released.ts:44-51`).
- [ ] **4. Nothing tells search engines a page exists** — medium. Sitemap still not
  submitted in Search Console (needs Konrad's auth; = guides-seo-tracker item 4). No
  IndexNow, no RSS (`/rss.xml`, `/feed.xml`, `/blog/feed.xml` all 404). After the one-time
  submission, add an IndexNow key file + one POST on each publish batch.
- [ ] **5. Content pages emit zero analytics** — medium. `posthog.init` has
  `capture_pageview: false` and no content or tool component fires any event
  (`apps/web/src/lib/analytics.ts:167`); `ContentCTA` links `/new` with no source param.
  Content URLs carry no room secrets, so a path-allowlisted `$pageview` (blog, guides,
  capture, tools — never `/r/`) plus one `content_cta_clicked` event is compatible with the
  privacy rules in `CLAUDE.md`.
- [ ] **6. `/import` intent contradiction** — medium. Indexable (no noindex, self-canonical),
  footer-linked from ~40 pages, yet `static-pages.ts` excludes it from the sitemap "so it
  should not enter discovery" — and its meta description is 175 chars (gate is 160).
  Pick one: `robots: noindex, follow` like `/new`, or `inSitemap: true` as a capture page.
  Either way trim the description.
- [ ] **7. Released es-419 guide links the parked noindex cluster** — medium. The only
  related-link on `/es-419/guides/ask-a-friend-to-pay-you-back` targets a permanently
  parked guide; that one edge exposes all six parked pages to crawlers. Known dead end
  (53dd70f documented it): es-419 has no released guide to repoint at, so the real fix is a
  policy change — let `checkedGuideHref` (`mdx-policy.ts:117`) accept blog-collection
  targets and reject unreleased guide targets, then repoint at
  `/es-419/blog/split-a-group-trip-across-countries` (live, indexed).
  (= guides-seo-tracker item 2, last edge.)
- [ ] **8. The mirror has no automation and no staleness alarm** — medium.
  `split-content-pull.yml` is deliberately dark (workflow_dispatch only); actual practice
  is same-session agent runs of `split-content-mirror.mjs` straight to prod main. If nobody
  runs it, mono-side corrections never ship and nothing notices. Either finish the
  disposable proof and schedule the workflow, or add a watchdog comparing mono's
  `split-content/_system/generated/manifest.json` hash against the deployed artifact.
- [ ] **9. The declared stylebook master is stale and disavowed** — medium.
  `_system/README.md` says rule edits go to mono `projects/peanut-split/seo/stylebook.md`;
  that copy still teaches "twelve currencies" as the safe phrasing (now a banned
  never-string) and mono's `split-content/README.md` disavows the folder. Pick one home,
  reconcile both READMEs in the same commit; same fix for the three drifting copies of the
  locale rulebooks.
- [ ] **10. Stylebook enforcement covers about a third of §11** — medium. ~24 machine gates
  exist; wholly unenforced: §6.4 adjectives, §6.7 currency-claim variants, all es-419 and
  pt-br token bans (voseo/plata already shipped once, seo-backlog.md:47), quote byte-lock,
  cast rules, em-dash cap. The doc entrance gate counts only "Peanut Split", so "Split by
  Peanut" is uncapped. Port the §11.1 blocks into `NEVER_STRINGS` as data rows.

## Low — batchable polish

- [ ] `/tools` declares `twitter:card=summary_large_image` but ships no `og:image` — the
  one page type with a broken unfurl. Add `opengraph-image.tsx` to the tools route
  (`seo.ts:123` hardcodes the card type for every `pageMetadata()` caller).
- [ ] `/splitwise-alternative` bypasses the length gate: title 63/62 chars (en/es), description
  171/169 (limits 60/160), no `| Peanut Split` suffix — its copy lives in
  `marketing/copy.ts`, outside `content.test.ts`. Trim, and gate `copy.ts` meta.
- [ ] `/splitwise-alternative` is the only comparison page with no Article schema and no
  sitemap lastmod — the money page sends zero freshness signals.
- [ ] Every Article/BlogPosting `image` site-wide is the 512px app icon (documented
  workaround for hashed og routes). A stable `/og/<slug>` Route Handler would fix JSON-LD
  and the hash-guessing problem at once.
- [ ] Guide fonts: two knerd TTFs ship uncompressed (~101 KB, convert to woff2 — keep the
  TTFs for the OG renderer) AND the LP emits zero font preloads despite `next/font`
  marking all five files preload-eligible; the H1 those fonts style is the LCP element.
- [ ] OG-image routes render for ANY slug (200 where the page 404s) — mirror the page
  contract: `dynamicParams = false` or 404 on lookup miss (`content-og.tsx:77`).
- [ ] `loadSplitContentManifest` re-validates all 15 artifact files per call; one
  `/sitemap.xml` fetch does ~12 full validations. Memoise per process.
- [ ] `parseGuide` never asserts `generated_at >= date`; a violating mirror ships
  contradictory dates silently. One zod refinement in `artifact.ts`.
- [ ] `GuideLayout.tsx:83` renders the raw ISO date to readers; use `formatDate()` like the
  blog does.
- [ ] Guide sitemap lastmod = `generated_at`, so a corpus-wide mirror re-stamps every guide
  as modified today (8 of 48 URLs on 14 Aug), diluting the freshness signal — contradicts
  the sitemap's own doc comment.
- [ ] `OG_LOCALE` map is defined twice (`seo.ts:35`, `split-content/metadata.ts:8`); export
  it once.
- [ ] `/fair-split-calculator` is typed Article while rent/mileage emit WebApplication
  `#tool` nodes — the page named "calculator" carries no calculator entity. Also `/tools`
  ("Calculators") lists only the 2 registry calculators; 3 of 6 capture pages hang off the
  site by one `/blog` card each.
- [ ] `/guides/` (trailing slash) reaches `/blog` in two 308 hops; add the direct rule.
- [ ] Marketing pages all serve `no-store` — no CDN/ISR shield for crawler traffic. Keep
  `force-dynamic` for the sitemap and gated guides; consider s-maxage + SWR elsewhere.
  Landing must stay uncached (cookie-localized).
- [ ] Native corpus has no `_system/AUDITS.md` though stylebook §11.4 mandates appending to
  it; create it with mono's record format or amend §11.4.
- [ ] Footer Help/Terms/Privacy links take a 307 locale hop on peanut.me; link `/en/...`
  directly or accept.

## Notes and open decisions

- `SEO_INDEXABLE=true` baked into the Docker image is a **decided, test-pinned trade-off**
  (`docker-contract.test.ts` asserts the exact line; rationale: nobody here has Dokploy
  access). Do not "fix" it by editing the Dockerfile — it needs the deployment-topology
  decision guides-seo-tracker item 5 describes.
- Title suffix: three conventions live (`| Peanut Split` markdown, `| Peanut` guides —
  documented byte-budget choice — and none on hand-built pages). Decide one policy.
- Landing metadata stays English in every locale — documented deliberate
  (`(marketing)/page.tsx:11-17`); revisit only with the page's own comment in hand. Add
  `Vary: Accept-Language`/`Cookie` before any caching is ever put in front of `/`.
- Locale roots `/es-419`, `/pt-br` 404 (and legacy `/es` redirects into that 404); cheap
  insurance would be a 308 to `/` if old `/es` backlinks exist.
- Parked guides self-canonicalize to noindexed URLs; pointing canonicals at the blog twins
  would recycle any accidental external link. Open question, not a defect.
- Localized pages footer-link the English-only `/tools` as "Calculadoras"; hide it on
  localized pages or accept.
- Guide CTAs mint 15 crawlable `/new?locale&utm_*` variants; verifier ruled the current
  noindex+canonical handling correct — do NOT robots-disallow `/new` (it would hide the
  noindex).
- One corrupted artifact file 500s `/sitemap.xml` and every guide at request time
  (accepted fail-loud; optional hardening: emit non-guide sitemap entries on
  `SplitContentArtifactError`).
- No HSTS header; add `strict-transport-security` at the edge when convenient.
- LP ships ~2.3 MB decoded JS because the hero embeds the real composer — by design; watch
  it on low-end mobile.
- Stale planning prose: mono `seo-backlog.md` still opens with the dead peanut.me/split
  cutover as current, and `SEO-DOMAIN-DECISIONS.md` still says the generated pipeline
  "remains dark" while 9 generated guides are live. Mark both.
- `/pt-br/guides/split-shared-house-bills` has no EN original — coherent at the I/O level
  (clean 404, no lying hreflang); editorial question only.
- Process: three concurrent sessions produced on one checkout during the audit (a
  mid-rebase push window can ship someone else's WIP to prod). Worktree-per-session or
  explicit-pathspec commits would close it.
