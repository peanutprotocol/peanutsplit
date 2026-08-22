# \_system — the input layer for Split's content

Everything here is input to a drafting agent. None of it is published.

It is inert by construction, not by convention: `src/lib/content.ts` reads `COLLECTIONS` as an
explicit allowlist, and `_system` is not in it. So nothing here is scanned, routed, sitemapped, or
reachable at a URL. It lives beside the pages it governs so an agent editing content finds it
without being handed a second path.

## The files

| File                     | What it is                                                                         | Read it when                                |
| ------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------- |
| `stylebook.md`           | The voice rulebook. Registers, banned constructions, vocabulary, locale notes.     | Always.                                     |
| `localization.es-419.md` | LATAM Spanish register, vocabulary, numbers and transcreation rules.               | Writing or editing an `es-419.md` page.     |
| `localization.pt-br.md`  | Brazilian Portuguese register, vocabulary, numbers and transcreation rules.        | Writing or editing a `pt-br.md` page.       |
| `product-truths.md`      | One fact, one place. Each claim has an ID, safe phrasing, unsafe phrasing, source. | Always.                                     |
| `competitor-claims.md`   | Verbatim-quote register. What we may assert about somebody else's product.         | Drafting or editing an `alternatives` page. |
| `cast.md`                | Which character appears where, and how much.                                       | Putting a `<Cast>` in a page.               |
| `AUDITS.md`              | Dated review findings, newest last. Each one becomes a stylebook rule (§11.4).     | Closing a review or a cold read.            |

## The collections

A page is a directory, one file per language: `{slug}/en.md`, `{slug}/es-419.md`, `{slug}/pt-br.md`.
`COLLECTIONS` in `src/lib/content.ts` is the allowlist — a directory outside it is not a collection.

| Collection     | Serves at      | What it is                                                                     |
| -------------- | -------------- | ------------------------------------------------------------------------------ |
| `blog`         | `/blog/{slug}` | Guides.                                                                        |
| `alternatives` | `/{slug}`      | Comparison pages.                                                              |
| `capture`      | `/{slug}`      | Intent capture. One search query, one answer, one next step — thin but honest. |

`alternatives` and `capture` are both served from the one `[page]` segment at the root of the site,
so a slug in one must not exist in the other, and neither may collide with a route Next already
owns. Both are checked in `content.test.ts` — one URL never serves two pages.

Every collection takes the same frontmatter. `capture` takes one key more: `intent`, the query
family the page answers, written the way a person types it. A capture page exists because a query
exists, so without `intent` there is nothing to check the page against later, and `content.test.ts`
fails a capture page that omits it.

Which of those keys, and which blocks, each `type` uses is in `stylebook.md`, not here.

## The run-book

1. Read `stylebook.md` and `product-truths.md`. For a translated page, also read its matching
   `localization.*.md` rulebook. Add `competitor-claims.md` for a comparison page and `cast.md` if
   the page draws a character.
2. Draft into `src/content/{collection}/{slug}/{locale}.md` — pick the collection above.
3. Every product claim must trace to a block in `product-truths.md`, and must use that block's
   `safe` phrasing. Every competitor fact must trace to a row in `competitor-claims.md`.
4. Run `pnpm typecheck && pnpm test && pnpm format` from the repo root. There is no CI in front of
   `main` and a push is production in about five minutes, so this is the whole gate.
5. Anything mechanical that a reviewer catches twice belongs in `NEVER_STRINGS` in
   `src/lib/content.test.ts`, not in a paragraph here. A rule nobody runs is a rule nobody keeps.

**Translating an existing page.** From `apps/web`, `node scripts/draft-translation.mjs <collection>/<slug> <locale>`
assembles the files above into one brief and writes the answer with `draft: true` in frontmatter —
no route, sitemap entry or hub card can reach it, every gate still runs on it, and review is deleting that line.

## What is not here yet

`templates/` and `workflows/` (one file per content type, one per drafting pass) and `AUDITS.md`
(dated cold-read findings, each landing as a stylebook line).

`stylebook.md` here is the operative copy — read it, draft against it. It is synced from mono at
`projects/peanut-split/seo/stylebook.md`, which is where an edit to the rules goes.
