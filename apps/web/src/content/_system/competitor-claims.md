---
last_verified: 2026-07-30
---

# Competitor claims

A comparison page may only assert a fact about somebody else's product if that fact has a row here.

## The rules

These are lifted from the header of the live comparison page
(`src/content/alternatives/tricount-alternative/en.md`) and from `copy.ts`, which say the same thing
in the same words. They are the strongest claims discipline in the repo, so they are the standard:

1. **Verbatim, or not at all.** Quote what the product says about itself. Do not characterise it, do
   not paraphrase it, do not summarise a feature list into an adjective.
2. **You opened the page.** "Don't add a claim you have not opened the page for." A quote taken from a
   search result, a review site, or a summary is not a quote.
3. **Nothing that rots.** "Don't add one that needs updating when they change a price." In practice
   this means: **no competitor prices, ever** — not a number, not a currency amount, not a tier price.
   The _fact_ that a paid tier exists is fine and does not rot. `NEVER_STRINGS` in
   `src/lib/content.test.ts` fails a currency amount on any root-slug page.
4. **Date the check.** Every row carries `checked`. Every page carries the same date in a comment at
   the top of the body. A quote with no check date is a quote we cannot defend.
5. **State facts, don't editorialize.** The quote does the arguing.
6. **The concession is not optional.** Every comparison page names what the other product is better
   at. Leaving it out is how a page reads like marketing.

Quoted text is exempt from `NEVER_STRINGS` only inside a `<Quote>` block, which is also the only
place a quote is properly attributed. A verbatim phrase dropped into a table cell (`"100% free"`) is
allowed to stay short, but it must still be verbatim and it must still be in the register below.

## The register

| id                         | competitor | verbatim quote                                                                                            | source            | checked    | used by                                             |
| -------------------------- | ---------- | --------------------------------------------------------------------------------------------------------- | ----------------- | ---------- | --------------------------------------------------- |
| `tricount-tracks-who-paid` | Tricount   | tricount helps you keep track of who paid what. Invite your friends, add your expenses, focus on the fun. | tricount.com/en   | 2026-07-28 | `alternatives/tricount-alternative` (en, es, pt-BR) |
| `tricount-settle-to-bank`  | Tricount   | Send a payment request straight from the app and get paid directly to your bank account.                  | tricount.com/en   | 2026-07-28 | `alternatives/tricount-alternative`                 |
| `tricount-bunq-card`       | Tricount   | Pay with your bunq card and the expense gets automatically added to your tricount.                        | tricount.com/en   | 2026-07-28 | `alternatives/tricount-alternative`                 |
| `tricount-100-free`        | Tricount   | 100% free                                                                                                 | tricount.com/en   | 2026-07-28 | `alternatives/tricount-alternative` (table cell)    |
| `splitwise-pro-expenses`   | Splitwise  | Add as many expenses as you like each day, with no interruptions.                                         | splitwise.com/pro | 2026-07    | `/splitwise-alternative` (`copy.ts`)                |
| `splitwise-pro-currency`   | Splitwise  | Splitwise can convert all your bills to any currency you'd like, using today's foreign exchange rates.    | splitwise.com/pro | 2026-07    | `/splitwise-alternative` (`copy.ts`)                |
| `splitwise-pro-ad-free`    | Splitwise  | A totally ad-free experience.                                                                             | splitwise.com/pro | 2026-07    | `/splitwise-alternative` (`copy.ts`)                |

## Open — do not use until a row exists

- **Splitwise's free daily expense cap is four per day.** This is the claim the whole
  daily-limit page family rests on, it is first-party, and **the verbatim quote and its URL are not
  recorded anywhere in this repo.** What we hold instead is the Pro-page line
  (`splitwise-pro-expenses`), which only implies that the free tier counts. Somebody has to open
  Splitwise's own page that states the number, paste it verbatim into a row above with its URL and a
  check date, and only then may a page say "four".
- Splid, Kittysplit, Settle Up: the six comparison drafts in
  `mono/projects/peanut-split/seo/drafts/` quote these, and none of those quotes has been transcribed
  into a row here. The drafts' own fix list already requires their prices to be removed. Do the
  transcription in the same pass, or the pages ship with claims nothing can check.
