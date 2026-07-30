# The cast, in content

Split has sixteen named characters and eleven roles built on them. They are the brand's whole
allowance of whimsy, which is exactly why the prose does not need any: names carry the joke, the
writing stays dry. Get that division of labour wrong in either direction and the page reads either
flat or tryhard.

## The roster

Do not copy it here. It lives in code, in one place:

- **Characters** — `src/lib/avatars.ts`, `PERSONAS`. Sixteen keys, each with a drawing, a palette and
  a one-line personality note (`raincoat-duck` → "hopes it rains").
- **Roles** — `src/components/marketing/LandingPersona.tsx`, `LANDING_CAST`. Eleven names the landing
  story already uses: the friend group (`bea`, `jules`, `mo`, `ana`, `you`), the two founders
  (`konrad`, `hugo`), and four rooms (`lisbon`, `flat`, `dinner`, `retreat`).
- **What a page may name** — `src/lib/cast.ts`, `CAST_NAMES`: the sixteen characters plus the eleven
  roles, and nothing else.

## How a page uses one

```mdx
<Cast name="raincoat-duck" size="sm" caption="Ana adds the taxi from the back seat." />
```

`name` takes a character key or a role name. `size` is `sm`, `md` or `lg`. `caption` is optional and
is the article's own voice.

A name outside `CAST_NAMES` fails `pnpm test`. That includes the retired keys still readable in the
database (`surfer-shark`, `ninja-pear`) and the classics (`doodle-pizza`) — the classics are objects,
not characters, and the retired keys are a compatibility shim that is never re-offered.

## Rules

1. **They never speak.** No character has a line of dialogue anywhere in the product, and none gets
   one here. `<Cast>` has no prop that would allow it. Bea asking "who paid for dinner?" on the
   landing page is a _person_ in a chat mock, not the Party Bee talking. Dialogue is the fastest route
   to the register Konrad ruled out.
2. **They never assert a product claim.** A drawing cannot cite a `product-truths.md` ID. Put the
   claim in the prose and let the character stand next to it.
3. **One per section, at most.** `Confetti.tsx` already states the house principle — "a minority on
   purpose… brand confetti with a character in it, not a shower of clip-art". A page with a character
   in every fold is a page nobody trusts.
4. **None in the tables.** A comparison table and a claims list are where a reader checks facts. Keep
   the drawings out.
5. **Roles beat characters when the page has a scene.** If a guide walks through a trip, use `ana` and
   `bea` so the group matches the landing page. Use a bare character key when the drawing is
   decoration rather than a person.
6. **`konrad` and `hugo` are real people.** Founder contexts only.
7. **`you` is `pocket-robot`.** It reads fine in a product mock and oddly in editorial prose. Prefer a
   named friend.
8. **The English name is never rendered.** `label` and `vibe` in `avatars.ts` are English literals
   outside the i18n catalogs, so a Spanish page naming the character would ship an untranslated
   string. The caption is the page's own words and translates with the page. Whether the names
   themselves ever get translated is an open decision.

## Where the cast is absent, on purpose

Three page families get no characters at all. Each one is read by somebody counting money, and a
drawing next to a number reads as a distraction from it:

- **Couples splitting by income.** Proportional splits, who earns what. A character makes it cute
  about somebody's salary.
- **Rent and utilities fairness.** Room sizes, who has the bigger bedroom, who ran the heating. This
  is a page people open mid-argument.
- **Splitwise migration.** Somebody is moving their history and wants to know what survives. Nothing
  playful helps.

Nothing else is off-limits. Travel guides, capture pages and the honest-concession sections are where
the cast earns its keep.
