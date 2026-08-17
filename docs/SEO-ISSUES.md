# SEO issues — the open list

The single open list for all Split SEO work — the site and the generated guides. Consolidated
2026-08-14 (Konrad's call): the guide tracker's open items moved here, so there is one ranked
list; decisions 1–21, the guides state table, the traps and the verify commands stay in mono
`projects/peanut-split/guides-seo-tracker.md`. Where a decision there closes an item here, the
Closed section records it — do not relitigate a numbered decision in this file.

Provenance: opened from the 2026-08-14 14-agent audit of peanutsplit.com (7 auditors, each
finding reproduced by an independent read-only verifier; 49 confirmed, 1 refuted) plus the
guide tracker's own open work. Full audit evidence:
https://claude.ai/code/artifact/f82fc8b2-cc4c-4241-b173-24268d110c7e

Every open item below was re-verified against `origin/main` and live production at
consolidation time on 2026-08-14 — nothing had been fixed in the interim.

Companion files:

- mono `projects/peanut-split/guides-seo-tracker.md` — decisions (do not relitigate), guides
  state table, traps that have already cost time, verify commands.
- [`../apps/web/docs/SEO-DOMAIN-DECISIONS.md`](../apps/web/docs/SEO-DOMAIN-DECISIONS.md) — domain decisions (2026-08-12, current).
- [`SEO-PLAN.md`](SEO-PLAN.md) and mono `projects/peanut-split/seo-backlog.md` — historical.

Check a box only after you verified the fix on production (the guide tracker has the verify
commands).

## Baseline verified healthy 2026-08-14

Do not re-audit these on sight: all 48 sitemap URLs answer 200 in one hop; bogus slugs
return real 404s (no soft-200, no 500); http→https, www→apex, trailing-slash and legacy
`/es/`→`/es-419/` redirects are single-hop; `og:image` resolves 200 for every page type;
parked guides serve 200 + `noindex, nofollow, noarchive`; robots.txt serves the designed
ruleset; the landing hero serves the room composer; hreflang as served is fully reciprocal
with a correct `x-default`; all JSON-LD parses with zero duplicate keys.

## Open — most valuable first

- [x] **1. Submit the sitemap in Search Console** and request indexing on the nine released
  guides. Konrad — needs auth. 48 URLs, all verified 200, indexable and self-canonical.
  Done 2026-08-17: sitemap submitted (48 URLs re-verified 200 the same day), indexing
  requested on the three strongest `en` guides plus the holiday-house guide after item 15's
  read; the remaining released URLs ride the sitemap crawl.
- [ ] **2. Give publishing a push channel.** No IndexNow, no RSS (`/rss.xml`, `/feed.xml`,
  `/blog/feed.xml` all 404), no submission code anywhere. After item 1, add an IndexNow key
  file + one POST per publish batch so future batches stop waiting on organic crawl of a
  near-zero-authority domain.
- [ ] **3. Claims IDs are unenforced for the native corpus** — the audit's one HIGH.
  Stylebook §7.5 says a claim with no ID does not ship; no content page carries
  `claims:`/`competitorClaims:`, the `Frontmatter` interface (`apps/web/src/lib/content.ts:63`)
  discards the keys, and no test resolves an ID. The generated pipeline enforces this (mono
  `scripts/split-content.mjs:939`) — port that gate: add the keys to `Frontmatter`, require
  them per §11.3 by type, resolve every ID against `_system/product-truths.md` and
  `_system/competitor-claims.md` in `content.test.ts`.
- [ ] **4. hreflang advertises drafts.** `localesForSlug` (`apps/web/src/lib/content.ts:137`)
  gates on file presence only, so a committed `published: false` (or unparseable) translation
  enters page hreflang and sitemap alternates while its route 404s. Trap:
  `content.test.ts:999-1022` uses `localesForSlug` as its own oracle, so the suite asserts
  the bug — the fix must also invert that test. Derive alternates from published docs (the
  split-content engine already does: `released.ts:44-51`).
- [ ] **5. Content pages emit zero analytics.** `posthog.init` has `capture_pageview: false`
  and no content or tool component fires any event (`apps/web/src/lib/analytics.ts:167`);
  `ContentCTA` links `/new` with no source param. Content URLs carry no room secrets, so a
  path-allowlisted `$pageview` (blog, guides, capture, tools — never `/r/`) plus one
  `content_cta_clicked` event is compatible with the privacy rules in `CLAUDE.md`.
- [ ] **6. `/import` intent contradiction.** Indexable (no noindex, self-canonical),
  footer-linked from ~40 pages, yet `static-pages.ts` excludes it from the sitemap "so it
  should not enter discovery" — and its meta description is 175 chars (gate is 160). Pick
  one: `robots: noindex, follow` like `/new`, or `inSitemap: true` as a capture page. Either
  way trim the description.
- [ ] **7. The mirror has no automation and no staleness alarm.** `split-content-pull.yml` is
  deliberately dark (workflow_dispatch only); actual practice is same-session agent runs of
  `split-content-mirror.mjs` straight to prod main. If nobody runs it, mono-side corrections
  never ship and nothing notices. Either finish the disposable proof and schedule the
  workflow, or add a watchdog comparing mono's `split-content/_system/generated/manifest.json`
  hash against the deployed artifact.
- [ ] **8. The declared stylebook master is stale and disavowed.** `_system/README.md` says
  rule edits go to mono `projects/peanut-split/seo/stylebook.md`; that copy still teaches
  "twelve currencies" as the safe phrasing (now a banned never-string) and mono's
  `split-content/README.md` disavows the folder. Pick one home, reconcile both READMEs in
  the same commit; same fix for the three drifting copies of the locale rulebooks.
- [ ] **9. Stylebook enforcement covers about a third of §11.** ~24 machine gates exist;
  wholly unenforced: §6.4 adjectives, §6.7 currency-claim variants, all es-419 and pt-br
  token bans (voseo/plata already shipped once, seo-backlog.md:47), quote byte-lock, cast
  rules, em-dash cap. The doc entrance gate counts only "Peanut Split", so "Split by Peanut"
  is uncapped. Port the §11.1 blocks into `NEVER_STRINGS` as data rows.
- [ ] **10. Two link sentences did not survive the 2026-08-14 copy pass, and one frame now
  carries three links.** `/guides/splitwise-currency-conversion`: "…and [why you owe someone
  you never paid] does that sum" — "that sum" has no antecedent and "never decides"
  overstates the product truth. `/guides/splitwise-vs-settle-up`: the second sentence is an
  instruction to go and click that declines to name Splitwise on the page whose job is naming
  both. Three sentences corpus-wide now end "…, and [why you owe someone i never paid]
  <verb>s it". Full sentence-level record: guide tracker history (mono `11fc6ce7`).
- [ ] **11. The corpus repetition rule is not written down.** Decision 20 (no two sentences
  across the fifteen guides may share a frame) has not landed as a numbered rule —
  `messaging.md` §6.17/§6.16.3 are page- and locale-scoped. Writing it is a source-input
  change, which pulls in regeneration and a new fingerprint; that is why both 2026-08-14
  passes left it.
- [ ] **12. The rules and the outputs are unproven against each other.** The nine released
  outputs were edited in place, never re-run through `workflows/generate-guide.md`. The gap
  closes the first time a guide is authored from these rules; until then treat the ruleset
  as untested.
- [ ] **13. `SEO_INDEXABLE=true` is baked into the Docker runner stage**, so any container of
  the prod image claims to be the indexed deployment. This is a decided, test-pinned
  trade-off (`docker-contract.test.ts` asserts the exact line; nobody here has Dokploy
  access) — do NOT "fix" it by editing the Dockerfile. It needs a deployment-topology
  decision, not a code edit.
- [ ] **14. Title suffix is split-brained.** Guides end ` | Peanut` (byte-budget choice:
  the longer suffix breaks the 60-char cap on four of nine titles); every other page ends
  ` | Peanut Split`; hand-built pages (`/tools`, `/splitwise-alternative`) carry no suffix at
  all. Retitling indexed pages is churn — settle one policy before the next cohort.
- [x] **15. Topical overlap** between `/guides/split-holiday-house-per-person-or-per-room`
  and `/split-airbnb-cost-unequal-rooms`. Read side by side 2026-08-17: one shared mechanic
  (room weighting, one H3 of the guide vs the post's whole subject), different primary
  intent, titles and worked examples. Complementary, not duplicative — hold lifted.
- [x] **16. Contextual links from the nine blog posts into the guides.** The guides now link
  each other; nothing on the authority-holding blog corpus links into them except the hub
  listing. Done 2026-08-17 (`2e00758`), verified on production: nine dofollow in-body links
  across seven posts, every released `en` guide gains at least one; two posts carry none
  by design (no honest placement).
- [x] **17. `guidelines/locales.md:17` still says both guide slugs require all three locale
  siblings.** False under manifest schema v2 — `split-shared-house-bills` ships `pt-br`
  only. Fixed 2026-08-17 (mono `7454c153`). One premise of this item was wrong: the sibling
  rule files were NOT all corrected on 2026-08-14 — `generation-templates/guide.md` lines 69
  and 114 still carry the three-locale rule. That is now its own item 20 below.
- [ ] **18. `/dev-ds` and `/dev-ds/audit` answer 200 on production** with no `x-robots-tag`
  (re-verified at consolidation). Absent from sitemap and unlinked, so discovery is
  unlikely, but an internal design-system surface is publicly crawlable.
- [ ] **19. Write the "hub is `/blog`" ruling into the mono generation contract.**
  `splitHubPath`/`splitToolsHubPath`/`splitCalculatorPath` in `urls.ts` still emit
  `/{locale}/split/...` and are load-bearing for the v2 manifest schema — changing them
  invalidates byte-pinned manifests, so the ruling belongs in the contract, not the code.
- [ ] **20. `generation-templates/guide.md` still carries the three-locale sibling rule**
  (lines 69 and 114: "List exactly the three sibling files under `alternates`" and the
  exact-symmetry confirm step). Same falsehood item 17 fixed in `locales.md`, in a second
  input with 15-way fan-out — needs its own fan-out record and mirror when corrected.

## Low — batchable polish

- [ ] `/tools` declares `twitter:card=summary_large_image` but ships no `og:image` — the
  one page type with a broken unfurl. Add `opengraph-image.tsx` to the tools route
  (`seo.ts:123` hardcodes the card type for every `pageMetadata()` caller).
- [ ] `/splitwise-alternative` bypasses the length gate: title 63/62 chars (en/es), description
  171/169 (limits 60/160), no suffix — its copy lives in `marketing/copy.ts`, outside
  `content.test.ts`. Trim, and gate `copy.ts` meta.
- [ ] `/splitwise-alternative` is the only comparison page with no Article schema and no
  sitemap lastmod — the money page sends zero freshness signals.
- [ ] Every Article/BlogPosting `image` site-wide is the 512px app icon (documented
  workaround for hashed og routes). Constraint from guide-tracker decision 17: the file
  convention stays for `og:image` (the hash trap only bites hand-written URLs) — so the fix
  is a stable image URL for JSON-LD specifically, never a hand-spelled og route.
- [ ] Guide fonts: two knerd TTFs ship uncompressed (~101 KB, convert to woff2 — keep the
  TTFs for the OG renderer) AND the LP emits zero font preloads despite `next/font`
  marking all five files preload-eligible; the H1 those fonts style is the LCP element.
- [ ] OG-image routes render for ANY slug (200 where the page 404s) and guide cards render
  per request (no `generateStaticParams`, 0.47s TTFB vs 0.12s cached blog card). Mirror the
  page contract (`dynamicParams = false` or 404 on lookup miss, `content-og.tsx:77`);
  revisit render cost if origin load matters.
- [ ] `loadSplitContentManifest` re-validates all 15 artifact files per call; one
  `/sitemap.xml` fetch does ~12 full validations. Memoise per process.
- [ ] `parseGuide` never asserts `generated_at >= date`; a violating mirror ships
  contradictory dates silently. One zod refinement in `artifact.ts`.
- [ ] `GuideLayout.tsx:83` renders the raw ISO date to readers; use `formatDate()` like the
  blog does.
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
- 8 of 48 sitemap URLs carry no `<lastmod>` — considered and dropped 2026-08-14 (static
  pages have no honest date source; hubs would cost three artifact reads per request).
  Reopen only if Search Console shows slow hub recrawl.
- No HSTS header; add `strict-transport-security` at the edge when convenient.
- LP ships ~2.3 MB decoded JS because the hero embeds the real composer — by design; watch
  it on low-end mobile.
- `SEO-DOMAIN-DECISIONS.md` still says the generated pipeline "remains dark" while 9
  generated guides are live and indexed — mark it. (mono `seo-backlog.md` was already
  marked superseded on 2026-08-14.)
- `/pt-br/guides/split-shared-house-bills` has no EN original — coherent at the I/O level
  (clean 404, no lying hreflang); editorial question only.
- Process: three concurrent sessions produced on one checkout during the audit (a
  mid-rebase push window can ship someone else's WIP to prod). Worktree-per-session or
  explicit-pathspec commits would close it.

## Closed

- **Wrong FX claim on the indexed currency page** — closed by guide-tracker decision 13:
  a misreading, not a contradiction. The subject is "The rates" (plural), the freeze is
  stated positively one clause earlier, and per-expense freezing means the trip genuinely
  is not on one rate. Nothing to change.
- **Released es-419 guide links a parked noindex guide** — closed by decision 12: the link
  stays (the es-419 manifest universe admits no released target; the parked page renders
  200 and the guide carries a hub link). Kept for any reopen: this single edge is how a
  crawler enters the whole 6-page parked cluster, and an indexed blog twin exists at
  `/es-419/blog/split-a-group-trip-across-countries` if `checkedGuideHref` ever learns
  blog-collection targets.
- **Guide sitemap lastmod re-stamps the whole class on corpus-wide mirrors** — closed as
  decided by decisions 18 and 21: `generated_at` is the only honest date source in the
  image, the 14 Aug overstatement is acknowledged, and dates are not bumped to tidy it.
