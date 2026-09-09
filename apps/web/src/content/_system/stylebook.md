# Peanut Split content stylebook

Updated 9 September 2026 after the product owner's request for clear, succinct copy.
This replaces the earlier narrator persona, forced jokes, scenes and page formulas.
Use it for every native marketing page, including metadata and translations.
When an older locale rule asks for a stylistic device that conflicts with this file,
use this file. Keep the locale's grammar, terminology and formatting rules.

## §1 Write for the person who needs the answer

- Answer the page's question in the first two sentences. Explain what to do next.
- Use ordinary words and complete sentences. Keep one main idea per paragraph.
- Prefer a concrete action or fact to a claim about how useful, honest or simple it is.
- Keep the details needed to make a decision: costs, limits, steps, examples and sources.
- Remove a sentence if deleting it loses no useful information.
- Do not promise to prevent awkward conversations, mistakes or disagreements.
- Do not claim personal experience or invent an anecdote. Label worked examples as examples.

## §2 Structure follows the question

The existing page types are `capture`, `comparison`, `guide` and `editorial`.
They describe a page's purpose, not different fictional narrators.

Use descriptive, sentence-case headings. Group related facts. Use a table for a real
comparison and a numbered list for a sequence of actions. A short question can be a
useful heading; do not ask a rhetorical question merely to announce the next sentence.

There is no minimum word count. A short answer should stay short. Keep an FAQ only
when its questions help readers; its frontmatter and rendered answers must agree.
The first FAQ answer also appears beneath the page heading without its question.
Make its opening sentence stand alone and name the subject it explains.

## §3 Voice

Write as a helpful person explaining the app. Warmth can come from consideration
for the reader; it does not require a joke, an aside or a story.

- **§3.1–§3.6:** Prefer active verbs and name the actor. Explain unfamiliar terms once.
  Avoid choppy strings of fragments as well as long sentences with several clauses.
- **§3.7:** No narrator wall-breaks or comments about writing the page.
- **§3.8–§3.9:** Use a specific detail when it explains the decision. Do not add scenery
  or decorative examples to make the page feel human.
- **§3.10:** Pricing, privacy, licensing, balances and instructions need literal wording.
  Do not turn limitations into jokes or use a cute heading for an important condition.
- **§3.11:** Say each fact once unless repetition prevents an error. FAQ summaries and
  metadata may repeat the answer because they are read separately.
- **§3.12:** Open with the answer. A quoted message belongs where the reader can use it,
  not in a fabricated conversation at the top of the page.
- **§3.13–§3.14:** No required interjection, exclamation mark or punchline. There is no
  quota of humour. Existing punctuation caps are ceilings, never drafting targets.
- **§3.15–§3.16:** Explain how the feature works. Do not inflate the emotional stakes
  or invent numbers to make a scene sound specific.
- **§3.17:** Name Peanut Split when needed, then use Split. Do not force an imperative
  product introduction or turn each section into a sales pitch.
- **§3.18:** Remove minimisers such as “simply” and unnecessary “just”.
- **§3.19:** Example: “Add each expense and who paid it. Split shows each person's
  balance.” Avoid: “The link is the room. The room is the receipt. Back to the beach.”

## §4 Comparisons and limitations

Explain a limitation beside the feature it qualifies. Give an alternative when it
helps the reader choose. Do not add a concession section to every page or reuse
“When X is the better tool” as a compulsory heading.

Use descriptive headings such as “Recurring bills” or “When to use a spreadsheet”.
Remove “the honest bit”, “what it really means” and similar claims about our candour.
A fair comparison needs evidence and useful distinctions, not praise of our honesty.

## §5 Illustrations

Read [cast.md](cast.md) before adding a character. Use existing art only.
Characters do not speak, narrate, make claims or stand in for sources.
The `cast` field must match the page. Use at most one character for capture/comparison,
two for a guide and none for editorial by default. Do not add art to meet a quota.
Keep cast absent from rent, income, couples and Splitwise migration pages.
Use the same example names across locales; translated sample room names come from
the shipped message catalog. Do not invent new characters for an article.

## §6 Patterns to remove

- Generic praise: seamless, effortless, powerful, robust, revolutionary, game-changing.
- Vague significance: a testament to, underscores the importance, a pivotal role.
- Announcements: it is important to note, here's the thing, let's dive in, in conclusion.
- Artificial contrasts: “not just X, but Y”, “this isn't X; it's Y”, “X, not Y” slogans.
  A factual distinction is fine when the reader needs it; explain it directly.
- Forced threes, paired fragments, repeated sentence shapes and decorative em dashes.
- Clever abstractions: receipts for evidence, theatre for policy, a “home” for a canonical URL.
- Invented scenes, fake reader dialogue, snide competitor remarks and reassurance without evidence.
- Closings that recap the whole page or tell the reader to get back to the holiday.
- Keyword repetition that makes headings or sentences harder to read.

Do not replace these with slang, deliberate errors or irregular punctuation.
This is an editing standard for legibility, not a method for evading AI detectors.
Keep the existing factual never-strings and locale checks in `content.test.ts`.

## §7 Claims and sources

[product-truths.md](product-truths.md) owns product facts. Declare the appropriate
`claims` IDs and preserve each claim's scope when paraphrasing. Do not strengthen a
claim to make a sentence shorter. For example, adding an expense offline does not
mean every action works offline, and recording a repayment does not verify it.

[competitor-claims.md](competitor-claims.md) owns competitor evidence. Comparisons
need `competitorClaims` IDs, primary sources and honest check dates. Keep existing
attribution. A source advertising an optional feature does not establish that the
feature is required. Do not infer the absence of a feature from silence.

Use brief, exact quotations inside `<Quote source="…">`; do not translate quotations
in localized pages. State comparisons in our own words in tables and cite the source.
Check current primary sources before changing a competitor fact or verification date.
Do not introduce competitor prices without a maintained source.

Hosted pricing, software license rights, service availability and who funds the app
are distinct facts. Follow their separate product-truth blocks and public-release
gates. Do not promise that the host will stay online or that future releases keep
the same license. Squirrel Labs maintains and funds Split. Peanut is an optional
payment service, not the maintainer; forks have no obligation to promote it.

## §8 Fairness pages and calculators

Show the calculation and explain its assumptions. Let the group choose the method;
a formula does not decide what is fair. Account for shared areas such as the kitchen
when comparing bedroom sizes. Explain when an equal split is sufficient.
A distance rate may include more than fuel; distinguish it from sharing a petrol bill.
Keep amounts, units, rounding, formulas and source dates accurate.

## §9 Locales and SEO

Read [localization.es-419.md](localization.es-419.md) for LATAM Spanish and
[localization.pt-br.md](localization.pt-br.md) for Brazilian Portuguese.
Use natural local phrasing, singular tú or você, and British English for English pages.
Preserve accents, currency notation and locale vocabulary. Do not translate an
English metaphor or joke: explain the same useful fact naturally.

Keep existing English slugs in every locale. English uses the bare root; localized
URLs use `/es-419/` and `/pt-br/`. Canonical URLs point to the same locale. Only link
to existing translations; unpublished content must remain unpublished.

Keep `headTerm` and `intent` aligned with the question. The title and a useful heading
must identify the topic naturally. Preserve metadata, claim IDs, internal links,
component props and release gates. Use the existing CTA labels: “Start a split”,
“Crear un split”, “Criar um split”. Do not add a countdown or an unsupported speed claim.

## §10 Names

Use Peanut Split for the full product name and Split after that. Never “Split by Peanut”.
Keep Settle Up, Splitwise and Tricount correctly spelled. Avoid mentioning the separate
Peanut payment service in ordinary SEO guides; the source page explains funding.

## §11 Review and validation

1. Read the opening without its heading. It should answer the reader's question.
2. Read the full page aloud. Remove repeated claims, forced rhythm and extra conclusions.
3. Check examples, arithmetic, claims, links, metadata and rendered FAQ agreement.
4. Review translations as writing in their own language.
5. Run the content and marketing-copy checks, then inspect the rendered page on mobile.

A copy edit must preserve `draft`, `published`, `v2Only` and release-gate metadata.
Compare these fields with the base commit and check sitemap URLs before deploying.
Publishing a held translation is a separate editorial decision.

The app's Markdown files in `src/content/{collection}/{slug}/{locale}.md` are authored
sources. Change those files, not built HTML. Generated `/guides/` pages have separate
sources in mono `split-content/_system/`; follow that pipeline and regenerate its outputs.

Add a dated finding to [AUDITS.md](AUDITS.md) when a review changes the writing rules.
Do not add a regex for every editorial judgement or force all pages into one template.

References consulted for the September pass:

- [Wikipedia: Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing)
- [Google: Creating helpful, reliable, people-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)
- [Google: Voice and tone](https://developers.google.com/style/tone)
- [GOV.UK: Use clear language](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/clear-language/)
