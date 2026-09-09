---
title: "Does Splitwise convert currency for a group?"
description: "How Splitwise Pro converts group expenses, what happens to settled and later entries, and how to check the exchange rate and currency before converting."
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
generated_at: 2026-09-09
---

Splitwise converts expenses to a single currency through Splitwise Pro. Without that conversion,
balances stay separate by currency. Changing an expense's currency label does not convert its
amount. See [Splitwise's currency guide](https://kb.splitwise.com/balances-and-expenses/how-can-i-manage-a-friendship-or-group-with-multiple-currencies).

## How Splitwise currency conversion works

Open the group or friendship and select “Convert to” your default currency. Check that currency in
Account Settings first. The operation uses the current market rate and includes past expenses,
even settled ones. It can affect other members' balances. Expenses added later in another currency
need another conversion. Splitwise recommends converting when the group is ready to settle.
[Source: Splitwise help centre](https://kb.splitwise.com/balances-and-expenses/how-can-i-manage-a-friendship-or-group-with-multiple-currencies).

The [Pro feature list](https://www.splitwise.com/pro) includes currency conversion. Check the
subscription price in your app before buying it.

## Which exchange rate should the group use?

Agree this before paying. A rate from the day of purchase, the day of settlement and the payer's
card statement can give different results.

The documented Splitwise conversion uses the market rate at conversion. Its guide does not describe
entering a custom rate. If you want an editable rate for the trip, compare the documented options in
[Splitwise vs Settle Up](/guides/splitwise-vs-settle-up).

## How Split handles expenses in different currencies

Peanut Split converts each supported expense when it is added, using the room's chosen currency.

<Callout type="info">
**The rate stays with the expense.** Split recognises 162 currency codes and supports automatic
conversion for 156. The rate is indicative and fixed when the expense is added; it may differ from
the payer's bank rate.
</Callout>

Conversion determines the recorded amount. Split then uses the balances to suggest a short payment
plan. [Debt simplification](/guides/why-do-i-owe-someone-i-never-paid) explains why that plan may
name a different payee from the person who paid the original bill.

An existing Splitwise Pro group may already have what it needs, especially if members agree to
convert when settling. Split is free to use and has no paid tier.

*Splitwise documentation checked 9 September 2026.*

<CTA text="Start a split" subtitle="Choose a currency and add the shared expenses." href="https://peanutsplit.com/new?utm_medium=content&utm_source=split-guide&utm_campaign=splitwise-currency-conversion&utm_content=final-cta" variant="card" />

<RelatedPages title="Related guide">
<RelatedLink href="/guides/splitwise-vs-settle-up">Splitwise vs Settle Up: features and limits</RelatedLink>
</RelatedPages>
