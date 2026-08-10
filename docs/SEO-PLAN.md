# Peanut Split — SEO plan v2 (historical, superseded)

> [!IMPORTANT]
> **This 2026-07-29 plan is not the implementation plan.** The current plan of
> record is
> [`mono/projects/peanut-split/domain-consolidation-2026-08-09.md`](https://github.com/peanutprotocol/mono/blob/main/projects/peanut-split/domain-consolidation-2026-08-09.md).
> Marketing and SEO are native mono content at `peanut.me/{locale}/split/*`;
> rooms, `/new`, and the PWA live at `split.peanut.me`; and
> `peanutsplit.com` is a redirect shell. There is no peanut.me rewrite to this
> app. Breaking compatibility is allowed for this pre-launch product; preserve
> access to existing live `/r/*` rooms during domain changes.

_2026-07-29. v2 after Konrad's direction: think engine + content types first, concrete pages second. Research basis (v1): live SERP sweeps EN/ES + full audit of the content engine in `apps/web`._

The content-type ideas below remain research input. The repo-local engine,
domain, localization, roadmap, and open-decision sections are retained only as
history unless the current mono plan restates them.

## Historical strategy frame

We don't plan pages; we plan **content types the engine can mass-produce**. Each type is a template + data contract + voice. Once a type exists, adding an instance is cheap (a data file or a markdown dir). SEO velocity then comes from the engine, not from one-off builds.

## Historical domain proposal (superseded)

The v2 proposal put content on **split.peanut.me** and kept
**peanutsplit.com landing-only**. That proposal is obsolete: split.peanut.me is
the product host, peanutsplit.com is a redirect shell, and native content lives
on `peanut.me/{locale}/split/*`.

- The historical proposal assumed subdomain content would accrue authority to
  the peanut.me root. The later decision requires paths on peanut.me instead.
- Existing marketing pages redirect to matching native peanut.me paths as each
  destination launches; they do not move to split.peanut.me.
- The proposal expected to restart the small amount of indexing that
  peanutsplit.com's four articles had accumulated.
- App and room paths live on split.peanut.me. Existing live `/r/*` access is the
  migration-compatibility exception.

## Content types (research inventory)

### 1. Fairness microtools — a whole category, not 3 calculators

Interactive, data-driven pages. The theme is **fairness**: not "divide by n" but "what's the defensible split". This is the differentiator — nobody in the niche owns "fair".

- **Mileage split** — passengers share a car trip; country defaults from official reimbursement rates (US IRS ¢/mile, UK 45p/mile, DE €0.30/km, NL, FR barème…). Rates = versioned, dated, sourced data files.
- **Rent split** — by room size (m²), by income, hybrid; the two dominant sub-intents in the SERP.
- **Car usage & wear-and-tear** — shared/borrowed car: fuel + depreciation + maintenance per km, not just fuel.
- **Wear-and-tear calculators for commonly shared things** — series: shared washing machine, tools, boat, kit. Same engine, different depreciation data.
- Plus the v1 generic trio (bill split w/ tip + uneven shares, trip cost, who-owes-who) as the volume anchors.

**Historical engine proposal:** MDX articles in this repo shipped zero client JS,
so tools were proposed as a separate `tools/` registry. The native mono content
system now owns the implementation. Reuse the calculator and SEO work where it
fits that system rather than rebuilding it by default.

### 2. Cross-site comparison pages

Existing `alternatives` collection, extended: `{competitor}-alternative` and `x-vs-y`. v1 targets stand (splid, settle-up, spliit, kittysplit, splitwise-vs-tricount, splitwise-daily-limit). Claims discipline as already enforced: verbatim, grep-verified quotes only.

### 3. Intent capture pages

One page per query, template-driven: structured frontmatter (intent, answer, proof, CTA) renders a consistent thin-but-honest page. For queries that deserve an answer but not an essay — "split bill app no sign up", "expense splitter without account", "group trip expense spreadsheet template" (real Google Sheets template + "or skip the spreadsheet"). Likely a third collection beside `blog`/`alternatives`.

### 4. Editorial — conceptions of fairness

High-register essays (and later interviews) about the _social_ problem, not the app. This earns links and defines the brand's territory. Topic bank:

- **Uneven consumption** — the non-drinker at a boozy table; the €9-salad vegetarian vs the steaks; arriving late / leaving early on a pooled bill; shared bottles ordered by half the table; "just had a bite of everything".
- **Uneven ability to pay** — student and banker at the same dinner; visitors from a cheaper country for whom the meal is a week's budget; the friend between jobs who's too embarrassed to say.
- **Ambiguous social contract** — birthday dinners (does the group cover them, and do they pick the pricey venue?); first dates; "let me get this" meaning the round, not the night; is-someone-expensing-this business meals; meeting the partner's parents; seniority norms where the eldest/highest-earner pays.
- **Mechanics and friction** — the restaurant that won't split the card; one person fronting for 8 and chasing; cash-only venues; cross-border groups on incompatible payment apps; tip/service charge — proportional or even?; FX and card fees landing on the payer; the €3.50 that's petty to chase but real money ×20.
- **Ongoing/multi-event settlements** — group trips with flights/Airbnb/car/groceries fronted by different people; flatmates and the long-shower problem; couples with unequal income (proportional vs 50/50 vs merged); deposits at risk when someone drops out; the last-minute canceller on a paid booking; tickets bought months ahead.

Each essay cross-links the matching microtool (the salad/steak essay → uneven-shares calculator; the flatmate essay → rent + wear-and-tear).

### 5. Voice (two registers, enforced)

- **Default (tools, capture pages, product copy):** super easy, friendly, very human, zero AI-tell. Short sentences, second person, no throat-clearing.
- **Editorial + interviews:** more sophisticated — allowed to be essayistic — but still no LLM boilerplate.

## Historical localization proposal

This plan proposed a separate translation pipeline in this repo. That is no
longer active. Mono owns the content source, exact locale routing, translations,
hreflang, and no-fallback behavior for `peanut.me/{locale}/split/*`.

## Historical roadmap (not active)

- **Phase 0 — plumbing (~1–2 days):** GSC + Bing verification; IndexNow on deploy; PostHog marketing-attribution carve-out (keep global `$pathname` strip for room routes, allow it on marketing routes only, or typed `marketing_page_view` + `landing_surface` on `room_created`); RSS. The old proposal to host marketing on split.peanut.me is superseded.
- **Phase 1 — engine work:** tools registry + shared shell (first tool = bill split, hardest = mileage w/ country data); capture-page collection + template; translate pipeline.
- **Phase 2 — content waves, per type:** comparisons (6 pages, data exists from v1 research) · microtools (fairness set) · capture pages · editorial 1/wk from the topic bank, 2/wk total cadence with guides.
- **Phase 3 — authority:** now flows into peanut.me by construction; still do AlternativeTo, Product Hunt (time with v2/import), directories, genuine Reddit.
- **Measurement:** GSC per content type; `room_created` by landing surface; monthly review, kill types with zero impressions after 8 weeks.

## Decisions closed or superseded

1. **Domain:** closed. split.peanut.me hosts the product; marketing/SEO is
   native at `peanut.me/{locale}/split/*`.
2. **Localization:** moved to mono's exact-locale content contract. This repo's
   proposed translation pipeline is not the source of truth.
3. **Cadence:** superseded. Current rollout and review gates live in the mono
   plan and content workflow.

_(The old subdomain conclusion is superseded. Calculator concepts remain useful
research and should reuse existing work where appropriate.)_
