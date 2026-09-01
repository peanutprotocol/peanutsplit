---
title: "Does Splitwise convert currency for a group?"
description: "What Splitwise does when a group spends in more than one currency: which conversion is paid for, which one only relabels, and who chooses the exchange rate."
slug: splitwise-currency-conversion
type: guide
lang: en
author: Squirrel Labs
date: 2026-08-12
tags: [currencies, splitwise]
claims: [automatic-currency-conversion, netting-is-bounded-exact, hosted-price]
cast: []
canonical: https://peanutsplit.com/guides/splitwise-currency-conversion
schema_types: [BlogPosting]
alternates:
  en: split-content/published/guides/splitwise-currency-conversion/en.md
generated_from:
  template: split-content/_system/generation-templates/guide.md
  data:
    - split-content/_system/data/guides/splitwise-currency-conversion.md
  product:
    - split-content/product/truths.md
  workflow: split-content/_system/workflows/generate-guide.md
  context:
    - split-content/_system/context/messaging.md
    - split-content/_system/context/valid-links.md
  guidelines:
    - split-content/_system/guidelines/seo.md
    - split-content/_system/guidelines/components.md
    - split-content/_system/guidelines/locales.md
    - split-content/_system/guidelines/intent-taxonomy.md
generated_at: 2026-08-24
---

{/* Every Splitwise fact on this page comes from a Splitwise page opened on 2026-08-12:
splitwise.com/pro, the multiple-currencies article on kb.splitwise.com, and three threads on
feedback.splitwise.com. Wording lifted from Splitwise is verbatim and carries its source; our own
sentences state a flat characterisation of a fact on one of those pages. Do not add a fact you have
not opened the page for, and do not add one that needs updating when they change a price. */}

Six people, one trip, receipts in pesos, euros and pounds; the group ends the week holding three
balances that do not add up to a single number. The person who fronted most of it waits for somebody
else to work it out, says nothing, and carries that long after everybody is home. Let Peanut Split
do the conversion instead. The room holds the group's expenses, and each one converts into the room's
currency at the moment it is added.

## Splitwise converts currency, but only on Pro

Splitwise describes the conversion on its own Pro page.

> Splitwise can convert all your bills to any currency you'd like, using today's foreign exchange rates.

*[splitwise.com/pro](https://www.splitwise.com/pro), checked 12 August 2026*

The help centre says the same thing in plainer words and names the tier it belongs to.

> If you want to settle up in a single currency, Splitwise Pro (our premium subscription) offers a currency conversion feature that converts all expenses in a group or friendship to your default currency at the current market exchange rate.

*[Splitwise help centre](https://kb.splitwise.com/balances-and-expenses/how-can-i-manage-a-friendship-or-group-with-multiple-currencies), checked 12 August 2026*

So Splitwise does convert, once somebody in the group pays for the tier, and only when a person
presses the button. The same article says what happens to an expense added after that press.

> Note: if you add new expenses in a different currency after converting, those won't be converted automatically. You'll need to tap the "Convert" button again, and then those items will be converted at the current exchange rate.

*[Splitwise help centre](https://kb.splitwise.com/balances-and-expenses/how-can-i-manage-a-friendship-or-group-with-multiple-currencies), checked 12 August 2026*

## What the free path does with multiple currencies

A free Splitwise group can hold expenses in several currencies. It keeps a separate balance for each
one, and changing the currency on an expense does not merge them.

> Please note that this only changes the currency label on the expense, it does not convert the amount.

*[Splitwise help centre](https://kb.splitwise.com/balances-and-expenses/how-can-i-manage-a-friendship-or-group-with-multiple-currencies), checked 12 August 2026*

The amount stays as it was typed and the symbol in front of it changes. That is the whole of the free
path: a group abroad reads its position as one line per currency, and somebody works out the rest by
hand before anyone can be paid back.

## Setting the exchange rate yourself is not an option

The rate is Splitwise's, taken at the moment the button is pressed. Somebody asked for a way to set
it per item back in 2012, on Splitwise's own feedback forum, and that thread carried 321 votes when
this page was checked.

> I would like to suggest a way to set the exchange rate for each item when doing a 'trip' group.

*A Splitwise user, [feedback.splitwise.com](https://feedback.splitwise.com/forums/162446-general/suggestions/3323194-currency-conversion), posted 4 November 2012, checked 12 August 2026*

A second thread asks for the same thing in different words.

> We now want to solve the balances in one currency to a by us predetermined rate.

*A Splitwise user, [feedback.splitwise.com](https://feedback.splitwise.com/forums/162446-general/suggestions/17686630-create-a-billing-currency-within-a-group), posted 2 December 2018, checked 12 August 2026*

Neither ask has produced a field for the group's own rate. The help centre describes one conversion
at the current market rate, so if that is not the rate the group agreed on, and not the rate the
payer's card charged either, there is nowhere in Splitwise to put the right one. Where Settle Up
stands on the same question is in [Splitwise vs Settle Up](/guides/splitwise-vs-settle-up).

## Default currency sits on the account, not on the group

The Convert button converts to your default currency, and that setting lives on your account rather
than on the trip.

> This button only appears when you have expenses or balances in a currency other than your default currency (to check or update your default currency, go to your Account Settings).

*[Splitwise help centre](https://kb.splitwise.com/balances-and-expenses/how-can-i-manage-a-friendship-or-group-with-multiple-currencies), checked 12 August 2026*

There is no per-group currency to pick, so whoever presses the button brings a personal account
setting to the whole group's history. A third thread asks for the same thing from the other
direction, on behalf of people in one group who live in different currencies.

> With current setup, bills are converted to one currency globally in group.

*A Splitwise user, [feedback.splitwise.com](https://feedback.splitwise.com/forums/162446-general/suggestions/20239312-multiple-default-currency-for-participants), posted 23 July 2017, checked 12 August 2026*

By then the organiser is in Account Settings, editing a personal preference so that a shared total
will come out the way the group already agreed. Never mind the menus!

### What to check before a Splitwise group settles

- Ask who has Pro before anyone assumes the totals have converted.
- Check the account default currency of whoever will press Convert.
- Agree the settle-up currency before the last day rather than during it.

## How Split converts a room that spends in several currencies

Split converts each expense as it is created, so nobody presses anything on the last day.

<Callout type="info">
**What Split does with the rate.** The catalogue recognises 162 currency codes, and 156 of them
convert automatically into the room's currency at the day's indicative rate, which is not your
bank's. Split fixes that rate on the expense as it is added, so history does not move.
</Callout>

A peso receipt entered on the second night keeps that night's rate, and a euro receipt entered on the
last night keeps its own. The room total is those recorded values added up. Conversion is not the
step that picks who pays whom. The room does that later, from the balances those values produce.
[Why you owe someone you never paid](/guides/why-do-i-owe-someone-i-never-paid) walks through that
step.

## The hosted price

The official Split service is free to use and has no paid tier. That describes the service
today; it is not a promise about its price or availability for its entire lifetime.

## When Splitwise is the better tool

If everyone paid in the same currency, none of this comes up, and a Splitwise group holding three
years of flat splits is not worth moving for one weekend abroad. A group that already pays for Pro
may need nothing else. If it is content with the market rate on the day and converts once at
settle-up, the button it has does the job. If the currency was never the problem, what is left is
how the cost divides:
[per person or per room on a holiday house](/guides/split-holiday-house-per-person-or-per-room).

<CTA text="Start a split" subtitle="Set the room currency once and add the receipts as they arrive." href="https://peanutsplit.com/new?utm_medium=content&utm_source=split-guide&utm_campaign=splitwise-currency-conversion&utm_content=final-cta" variant="card" />

<RelatedPages title="Related guide">
<RelatedLink href="/guides/splitwise-vs-settle-up">Splitwise vs Settle Up</RelatedLink>
</RelatedPages>
