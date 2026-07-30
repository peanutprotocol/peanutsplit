# capture

Intent-capture pages. One search query, one answer, one next step — thin but honest.

A page is a directory here, a file per language: `{slug}/en.md`, `{slug}/es.md`, `{slug}/pt-BR.md`.
The slug is served at the root of the site (`/split-bill-no-signup`), from the same `[page]`
segment as the `alternatives` collection, so it must not collide with an `alternatives` slug or
with a route Next already owns.

Frontmatter is the shared set plus one key of its own: `intent`, the query family the page
answers, written the way a person types it. `content.test.ts` fails a capture page without it.

How to draft one: `../_system/README.md`.

This file holds the directory open until the first page lands. Delete it then.
