# Peanut Split — SEO plan v2 (engine-first)

_2026-07-29. v2 after Konrad's direction: think engine + content types first, concrete pages second. Research basis (v1): live SERP sweeps EN/ES + full audit of the content engine in `apps/web`._

## The frame

We don't plan pages; we plan **content types the engine can mass-produce**. Each type is a template + data contract + voice. Once a type exists, adding an instance is cheap (a data file or a markdown dir). SEO velocity then comes from the engine, not from one-off builds.

## Domain architecture (changed in v2)

**Authority feeds peanut.me.** Content lives on **split.peanut.me**; **peanutsplit.com stays landing-only** (hero + app entry, thin, canonical to itself).

- Subdomain content accrues to the peanut.me registrable domain — every link a calculator or essay earns strengthens the domain the card/main product lives on, instead of a standalone domain starting from zero.
- Existing content pages (blog + `/splitwise-alternative`) 301 from peanutsplit.com to split.peanut.me at cutover; hreflang + sitemap regenerate from the new host. One config knob if we make the host an env of the content routes.
- Cost to accept: we restart what little indexing peanutsplit.com's content has (it's 4 articles — cheap to move now, expensive later). Landing keeps ranking for the brand term.
- App/rooms stay wherever the app lives; `/r/*` indexing rules unchanged.

## Content types (the engine's primitives)

### 1. Fairness microtools — a whole category, not 3 calculators

Interactive, data-driven pages. The theme is **fairness**: not "divide by n" but "what's the defensible split". This is the differentiator — nobody in the niche owns "fair".

- **Mileage split** — passengers share a car trip; country defaults from official reimbursement rates (US IRS ¢/mile, UK 45p/mile, DE €0.30/km, NL, FR barème…). Rates = versioned, dated, sourced data files.
- **Rent split** — by room size (m²), by income, hybrid; the two dominant sub-intents in the SERP.
- **Car usage & wear-and-tear** — shared/borrowed car: fuel + depreciation + maintenance per km, not just fuel.
- **Wear-and-tear calculators for commonly shared things** — series: shared washing machine, tools, boat, kit. Same engine, different depreciation data.
- Plus the v1 generic trio (bill split w/ tip + uneven shares, trip cost, who-owes-who) as the volume anchors.

**Engine contract:** MDX articles ship zero client JS by design, so tools are a separate primitive: a `tools/` registry where each tool = config (inputs, formula, country-defaults data file) + one shared shell (layout, FAQ/JSON-LD from config, OG image, localized strings). Adding tool #7 = a config + data file, not a new page build. Every result screen ends in **"turn this into a room"** with the numbers prefilled.

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

## Localization engine

Own engine, like peanut-ui's — not shared code (standing ruling: Split never inherits a content change it didn't ask for). The multi-locale routing/hreflang layer already shipped 28 Jul; what's missing is the **production pipeline**: a translate step that takes `{slug}/en.md` → draft `es.md`/`pt-br.md` for review, plus localized strings/data for tools (mileage rates _are_ the localization for the mileage tool — a DE visitor gets €/km defaults). No-English-fallback rule stands: untranslated = absent, not duplicated.

## Roadmap

- **Phase 0 — plumbing (~1–2 days):** GSC + Bing verification; IndexNow on deploy; PostHog marketing-attribution carve-out (keep global `$pathname` strip for room routes, allow it on marketing routes only, or typed `marketing_page_view` + `landing_surface` on `room_created`); RSS. **Plus now: the split.peanut.me host decision executed** (DNS, host config, 301s) — do it while there are 5 pages, not 50.
- **Phase 1 — engine work:** tools registry + shared shell (first tool = bill split, hardest = mileage w/ country data); capture-page collection + template; translate pipeline.
- **Phase 2 — content waves, per type:** comparisons (6 pages, data exists from v1 research) · microtools (fairness set) · capture pages · editorial 1/wk from the topic bank, 2/wk total cadence with guides.
- **Phase 3 — authority:** now flows into peanut.me by construction; still do AlternativeTo, Product Hunt (time with v2/import), directories, genuine Reddit.
- **Measurement:** GSC per content type; `room_created` by landing surface; monthly review, kill types with zero impressions after 8 weeks.

## Decisions still open (Konrad)

1. **split.peanut.me cutover timing** — Phase 0 (recommended: move before content wave) or after?
2. Localize comparison pages to es/pt-BR (still formally reverses ROADMAP's "English by design")? The localization-engine directive implies yes — confirm.
3. Cadence: Claude drafts 2/wk (1 editorial + 1 guide/capture) + translations, Konrad reviews before push?

_(v1's "calculators in scope?" and "peanut.me backlink?" are answered by this revision: yes-and-bigger, and superseded by the subdomain move.)_
