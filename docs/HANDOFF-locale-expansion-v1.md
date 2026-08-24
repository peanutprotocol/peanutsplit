# HANDOFF — Split locale expansion v1 (pl, uk, de, fr)

**For:** the orchestrating agent picking this up. Self-contained; assume no other context.
**From:** Claude session with Konrad, 2026-08-17.
**Optimization target (Konrad's words): speed and a v1 out, not a perfect outcome.**

## Your job, in order

1. **Adversarially review the inherited plan** (below). It was written before the v1-speed
   directive and is over-built. Attack its assumptions, cut it harder, produce a revised plan.
   Post the revised plan as a heartbeat, then **start executing immediately** — do not wait for
   approval of the replan. Only the two human gates below block.
2. **Orchestrate the work e2e** with subagents. Konrad has explicitly opted into multi-agent
   orchestration for this work — that authorization is granted here, you don't need to re-ask.
3. Land v1: new locales live on prod, gates respected, Notion + memory updated.

## Non-negotiables (survive ANY replan)

- **Konrad reviews before prod.** Batch it — ONE review of all catalogs + any content copy,
  staged and ready so approval → ship is one command. Never ship copy he hasn't seen.
- **uk needs a human native-speaker review.** Solidarity done badly reads worse than absence
  (Konrad agreed to this bar). You cannot source the reviewer; flag it to Konrad early. If it
  becomes the long pole: ship pl/de/fr, hold uk behind the review. Do not block the wave on it.
- **Verify-role subagents are read-only.** Reviewers report; a separate fixer applies.
- **Subagents run on opus** (Konrad's standing rule). haiku for HTML report assembly. Screenshots ≤1000px wide.
- **"Verified" means you opened the page.** Playwright against a running dev server, every new
  locale's key screens, before calling anything done.
- **Heartbeat during orchestration** — post progress to Konrad between phases; never go dark.
- **Git:** ship via the `split-ship` skill (alias `split-yolo`) — local gate (`pnpm verify` +
  existing e2e for the touched surface), push straight to main (unprotected, no CI; Dokploy
  deploys prod in ~5 min), then open peanutsplit.com and verify live. No PRs in this repo.
  Commit with **explicit pathspecs** — other Claude
  sessions run concurrently in this checkout; never `git add -A`. Worktree tooling is broken in
  this sandbox: parallel agents must own **disjoint files** (the per-locale catalog layout gives
  you this for free — one JSON per locale; you alone touch the shared wiring files).
- **Localization dilemmas follow peanut.me mono conventions** (Konrad's binding ruling, 31 Jul).
  The extraction already exists — see rulebook sources below. Don't re-derive; carry.

## Verified context (I checked all of this in the repo today)

- Repo: `/workspaces/sandbox/mono/peanutsplit`, app in `apps/web`. pnpm via corepack.
  Bootstrap: `pnpm bootstrap`. Full gate: `pnpm verify` (typecheck + i18n:audit +
  marketing-copy:audit + ui-icons:audit + tests + settle verification).
- Current locales: `en`, `es-419`, `pt-br` via next-intl. Cookie-resolved for the app (no
  `[locale]` URL segment); path-prefixed URLs only for indexed content. Resolution:
  explicit → `x-split-locale` proxy header → `ps-locale` cookie → Accept-Language → `en`.
- **Adding a locale touches exactly 4 code files + 1 catalog:**
  `apps/web/src/i18n/locales.ts` (`LOCALES` + `HREFLANG`),
  `apps/web/src/i18n/messages.ts` (STATIC import specifier — never dynamic, past prod incident),
  `apps/web/src/i18n/paths.ts` (`PREFIX_BY_LOCALE`),
  `apps/web/src/i18n/messages/<locale>.json` (~1,511 lines, ICU MessageFormat).
- `apps/web/scripts/i18n-audit.mjs` enforces key parity + placeholder use across ALL catalogs in
  `pnpm verify` — a new locale file is auto-gated the moment it exists.
- **THE PLURALS TRAP (highest-risk bug class):** en/es/pt ICU messages only ever use
  `one`/`other`. Polish and Ukrainian require `few`/`many` (2 wydatki / 5 wydatków). Every
  plural message must be expanded per locale, and the audit does NOT check plural-category
  completeness. Cheap fix: extend i18n-audit (~30 lines) to require locale-appropriate
  categories. Do this first; it converts the worst silent failure into a CI failure.
- SEO content: `apps/web/src/content/` — 17 en pages (4 alternatives, 9 blog, 4 capture);
  es-419/pt-br carry 6 each. **No fallback by design**: an untranslated page 404s and leaves the
  sitemap — so a locale can ship catalog-only with zero SEO work and nothing breaks. hreflang /
  canonicals / sitemap all derive automatically from which `<locale>.md` files exist.
- Rulebook sources for new locales: `apps/web/src/content/_system/stylebook.md` (locale-agnostic,
  carries), `localization.es-419.md` + `localization.pt-br.md` (structure to copy),
  `competitor-claims.md`, `product-truths.md`. Mono conventions extraction referenced from the
  es-419 file. A separate authoring pipeline exists at `mono/split-content` — irrelevant if you
  defer SEO (recommended, below).
- Tracking: Notion task https://app.notion.com/p/3bf83811757981bf9d60db1e9c98da68 (✅ Tasks DB).
  Cross-session memory: `/home/kkonrad/.claude/projects/-workspaces-sandbox/memory/project_split_locale_expansion.md`.
  Update both when done (status, what shipped, what's held).

## Inherited plan — attack this

Five sequential workflows: WF1 foundations (4 full rulebooks + glossary + red-team, ~12 agents,
Konrad ruling gate) → inline wiring → WF2 catalogs (per locale: 3-chunk translation → merge →
3-lens review panel → fixer → audit, ~30 agents, Konrad + native gate) → WF3 SEO trees de/fr
(keyword research → judge → transcreation → claims review, ~20 agents, copy gate) → WF4
verification sweep + ship.

Assumptions worth killing, with my own candid assessment:

1. **"Every locale needs a full rulebook before translation."** Probably false for v1. The
   stylebook carries unchanged; es-419's rulebook is mostly mono-carried rules plus market
   vocabulary. v1 cut: a **1-page addendum per locale** (formality register — Polish
   ty/formal choice, German du/Sie, French tu/vous; 10-term glossary; known traps), written by
   the same agent that translates, reviewed in the same Konrad batch as the catalog. Full
   rulebooks only when SEO transcreation starts (v1.1).
2. **"3-chunk translation + merge + 3-lens panel per catalog."** Over-built for a 1,511-line
   file. v1 cut: one translator + one adversarial native-lens reviewer + one fixer per locale.
   The chunk-merge consistency machinery existed to fix a drift problem that single-translator
   doesn't have. Keep the shared 10-term glossary (one fast agent, before translators start).
3. **"WF3 SEO in v1."** Cut entirely. No-fallback design means catalog-only locales are
   complete and correct. SEO trees for de/fr (Splid-alternative page, Tricount fr) are v1.1 —
   note them in the Notion task and move on. This alone removes ~20 agents and the slowest
   review cycle.
4. **"Sequential workflows with gates between each."** With SEO cut, collapse to: one prep step
   (glossary + audit extension + wiring), one catalog workflow (4 locales pipelined
   independently), one verification pass, ONE Konrad gate at the end. Two human
   waits total (batch review; uk native), not four.
5. Also check before trusting: whether `HREFLANG` casing for pl/uk/de/fr needs entries (it
   will: `pl`, `uk`, `de`, `fr` — no region), whether any hardcoded locale lists exist outside
   the 4 files (grep; the audit script has its own LOCALES const — line ~40), and whether
   `Accept-Language` mapping in `locales.ts` needs the new families added (it will —
   `localeFromLanguageTag` is allowlist-based).

Where you disagree with MY cuts, yours win — you're the one executing. The non-negotiables
section is the only part you can't overrule.

## Definition of done (v1)

- pl, de, fr (and uk if native review lands) in the switcher on prod; `pnpm verify` green
  including the plural-category audit extension.
- Every shipped locale's key screens (home, /new, a room with expenses + settle flow) opened
  via Playwright and screenshotted; haiku-assembled HTML report delivered to Konrad.
- Konrad approved the batch before ship. uk status explicit (shipped or held-behind-review).
- Notion task + memory file updated. Anything cut (SEO, uk hold, rulebook depth) written down
  there as v1.1 backlog, not silently dropped.
