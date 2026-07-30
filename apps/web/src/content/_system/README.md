# \_system — the input layer for Split's content

Everything here is input to a drafting agent. None of it is published.

It is inert by construction, not by convention: `src/lib/content.ts` reads `COLLECTIONS` as an
explicit allowlist, and `_system` is not in it. So nothing here is scanned, routed, sitemapped, or
reachable at a URL. It lives beside the pages it governs so an agent editing content finds it
without being handed a second path.

## The files

| File                   | What it is                                                                         | Read it when                                |
| ---------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------- |
| `stylebook.md`         | The voice rulebook. Registers, banned constructions, vocabulary, locale notes.     | Always.                                     |
| `product-truths.md`    | One fact, one place. Each claim has an ID, safe phrasing, unsafe phrasing, source. | Always.                                     |
| `competitor-claims.md` | Verbatim-quote register. What we may assert about somebody else's product.         | Drafting or editing an `alternatives` page. |
| `cast.md`              | Which character appears where, and how much.                                       | Putting a `<Cast>` in a page.               |

## The run-book

1. Read `stylebook.md` and `product-truths.md`. Add `competitor-claims.md` for a comparison page and
   `cast.md` if the page draws a character.
2. Draft into `src/content/{collection}/{slug}/{locale}.md`. Collections: `blog` (guides, served at
   `/blog/…`), `alternatives` and `capture` (both served at a root slug through `[page]`).
3. Every product claim must trace to a block in `product-truths.md`, and must use that block's
   `safe` phrasing. Every competitor fact must trace to a row in `competitor-claims.md`.
4. Run `pnpm typecheck && pnpm test && pnpm format` from the repo root. There is no CI in front of
   `main` and a push is production in about five minutes, so this is the whole gate.
5. Anything mechanical that a reviewer catches twice belongs in `NEVER_STRINGS` in
   `src/lib/content.test.ts`, not in a paragraph here. A rule nobody runs is a rule nobody keeps.

## What is not here yet

`templates/` and `workflows/` (one file per content type, one per drafting pass) and `AUDITS.md`
(dated cold-read findings, each landing as a stylebook line). `stylebook.md` is a stub — the written
version lives in mono at `projects/peanut-split/seo/stylebook.md` and gets copied in.
