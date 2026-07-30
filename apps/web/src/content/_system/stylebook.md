# Stylebook

**Arriving — see `mono/projects/peanut-split/seo/stylebook.md`.**

The written version lives in mono while it is being reviewed, and gets copied into this file. Until
then, this is the stub the run-book points at, and a drafting agent must go read the mono copy.

What it will hold, in this order:

1. **Two registers** — the default one (product surfaces, capture pages: short, second person, no
   throat-clearing) and the editorial one (fairness essays, guides: full sentences, sentence-case
   headings, no exclamation marks). Which content type gets which.
2. **Banned constructions** — the named-pattern table ("Not just X, it's Y", "Whether you're X or Y",
   "Imagine", setup→reveal, "and that's where Split comes in").
3. **Hollow modifiers** — the blacklist.
4. **Structural tells** — em-dash cap, no section transitions, do not restate a proof point.
5. **Vocabulary** — "room" not "group", "link" not "invite", "Start a split" as the single CTA label.
6. **Claims discipline** — pointers to `product-truths.md` and `competitor-claims.md`.
7. **Locale notes** — `es` and `pt-BR`, register and vocabulary, in three short sections rather than
   separate files.

Two things already exist and are not waiting on it: the mechanical half of §2–§5 is
`NEVER_STRINGS` in `src/lib/content.test.ts`, and the "free forever" rule is
`scripts/marketing-copy-audit.mjs`. Anything a reviewer catches twice belongs in one of those two,
not in a paragraph here.
