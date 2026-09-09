---
title: 'Splitwise alternative, free with no signup'
description: 'Use Peanut Split without an account or daily expense cap. Compare currency conversion, import your Splitwise CSV and share a room link.'
publicSourceTitle: Free and open-source Splitwise alternative
publicSourceDescription: 'Read the AGPL source or host your own copy. Peanut Split is maintained by Squirrel Labs and free to use on the official service.'
date: 2026-07-25
updated: 2026-08-24
type: comparison
releaseGate: public-source
headTerm: splitwise alternative
tags: [alternatives]
claims:
    - room-size-20
    - hosted-price
    - squirrel-labs-stewardship
    - public-source-and-self-hosting
    - link-is-the-key
    - no-app
    - automatic-currency-conversion
    - netting-is-bounded-exact
    - offline-creates-only
    - settle-is-a-record
    - offline-queue-30
competitorClaims:
    - splitwise-pro-expenses
    - splitwise-pro-currency
    - splitwise-pro-ad-free
    - splitwise-free-daily-cap
publicSourceFaqs:
    - question: 'Is Split FOSS or only free to use?'
      answer: 'Split is free to use, and its released source is licensed under AGPL-3.0-or-later. The licence lets you inspect, run, modify, share and self-host the software under its terms.'
    - question: 'Can I self-host Split?'
      answer: 'Yes. The public repository includes deployment instructions, database migrations and API documentation. You manage the hosting, backups, updates and any integrations you enable.'
    - question: 'Who maintains Split?'
      answer: 'Squirrel Labs maintains Split and pays its costs, including work hours.'
faqs:
    - question: 'Do I need an account?'
      answer: 'Everyone can join a Split room through its link and enter a name. No email address, password or ID check is required.'
    - question: 'Is there a limit on how many expenses we can add?'
      answer: 'There is no daily expense cap. A room holds 500 expense entries; when importing older history, some entries may be combined into opening balances.'
    - question: 'Can I import my Splitwise history?'
      answer: 'Yes. Export the group as a spreadsheet and open peanutsplit.com/import. Review warnings and balances before creating the room. The CSV is read in your browser; the resulting expense data is saved when you create the room.'
---

{/* Competitor quotations were last checked against the linked sources on 2026-08-21. Keep quoted text unchanged.
Sources and claim IDs are recorded in ../_system/competitor-claims.md. */}

<Hero
  eyebrow="Comparison"
  title="Splitwise alternative, free with no signup"
  subtitle="Peanut Split is free to use. Share a room link, enter a name and add expenses without a daily cap. You can also import an existing Splitwise group."
  cta="Start a split"
  ctaHint="No account or download required." />

[Import your Splitwise group](/import)

## Expenses, currencies and cost

Splitwise lists these as Pro features:

<Quote source="splitwise.com/pro">
Add as many expenses as you like each day, with no interruptions.
</Quote>

<Quote source="splitwise.com/pro">
Splitwise can convert all your bills to any currency you’d like, using today’s foreign exchange rates.
</Quote>

<Quote source="splitwise.com/pro">
A totally ad-free experience
</Quote>

Its help centre describes the free daily limit:

<Quote source="kb.splitwise.com/pro">
Add as many expenses as you need without hitting a limit (free users can add up to 4 expenses each day).
</Quote>

| Feature              | Peanut Split                                | Splitwise                                                |
| -------------------- | ------------------------------------------- | -------------------------------------------------------- |
| Adding expenses      | No daily cap                                | Free accounts have a daily cap; Pro removes it           |
| Currency conversion  | 156 currencies at the day's indicative rate | Listed as a Pro feature                                  |
| Cost                 | Free to use, no paid tier                   | Free version and paid Pro subscription                   |
| Joining a Split room | Open a link and enter a name                | Splitwise uses accounts for people accessing their group |

Splitwise quotations were checked on [the Pro page](https://www.splitwise.com/pro) and [help centre](https://kb.splitwise.com/pro/what-is-splitwise-pro-and-who-can-use-it) on 21 August 2026.

## Bring your existing group

Export the group as a spreadsheet from Splitwise and open [the import page](/import). Review the file, warnings and balances before sharing the new room link.

A source file can contain up to twenty people. Recent expenses come across in detail; older entries may become “Balance brought forward” rows. Receipt photos do not transfer. Keep the original group until everyone has checked the balances.

## Using Split

Keep the room link in the group chat. Anyone with the link can access the room, and there is no account recovery if you lose it.

New expenses added without a connection wait on your device and send when you reconnect. Editing expenses and recording payments need a connection.

Split suggests a short payment plan. Pay by cash, bank transfer or another agreed method, then record it. Split does not move money or verify payments with a bank.

## When staying on Splitwise makes sense

If your group already uses Splitwise and its limits do not affect you, keeping the existing group avoids a migration. Compare the features you use before switching, especially if you rely on a paid plan.

<PublicSourceOnly>

## Source code and self-hosting

Split's released source is available under AGPL-3.0-or-later. You can inspect, run, modify, share and self-host it under that licence.

The repository includes deployment instructions, the database schema and migrations. If you self-host, you manage the database, backups, domain, TLS, updates and any optional integrations.

Squirrel Labs maintains Split and pays its costs, including work hours.

The official service will stay free. If it becomes unaffordable to run, it will close rather than start charging.

[Source code, licence and hosting details](/source)

</PublicSourceOnly>

<CTA
  title="Create a room for your group"
  body="Share a room link so everyone can add expenses. No account or download required."
  text="Start a split" />

<FAQ>
<PublicSourceOnly>
<FAQItem question="Is Split FOSS or only free to use?">Split is free to use, and its released source is licensed under AGPL-3.0-or-later. The licence lets you inspect, run, modify, share and self-host the software under its terms.</FAQItem>
<FAQItem question="Can I self-host Split?">Yes. The public repository includes deployment instructions, database migrations and API documentation. You manage the hosting, backups, updates and any integrations you enable.</FAQItem>
<FAQItem question="Who maintains Split?">Squirrel Labs maintains Split and pays its costs, including work hours.</FAQItem>
</PublicSourceOnly>
<FAQItem question="Do I need an account?">Everyone can join a Split room through its link and enter a name. No email address, password or ID check is required.</FAQItem>
<FAQItem question="Is there a limit on how many expenses we can add?">There is no daily expense cap. A room holds 500 expense entries; when importing older history, some entries may be combined into opening balances.</FAQItem>
<FAQItem question="Can I import my Splitwise history?">Yes. Export the group as a spreadsheet and open peanutsplit.com/import. Review warnings and balances before creating the room. The CSV is read in your browser; the resulting expense data is saved when you create the room.</FAQItem>
</FAQ>

<RelatedPages>
<RelatedLink href="/settle-up-alternative">If the group is coming from Settle Up instead</RelatedLink>
<RelatedLink href="/tricount-alternative">How Split compares with Tricount</RelatedLink>
<RelatedLink href="/blog/split-bills-without-an-app">Split bills without an app</RelatedLink>
</RelatedPages>
