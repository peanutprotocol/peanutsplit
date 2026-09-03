---
title: Splitwise alternative, free with no signup
description: A Splitwise alternative free to use today, with no account and no app. Share one link, add expenses without a daily cap, and use every core feature.
publicSourceTitle: Free and open-source Splitwise alternative
publicSourceDescription: The official service is free to use with no paid tier. Its AGPL source can be self-hosted, with schema and deployment limits documented.
date: 2026-07-25
updated: 2026-08-24
type: comparison
releaseGate: public-source
headTerm: splitwise alternative
tags: [alternatives]
claims:
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
    - question: Is Split FOSS or only free to use?
      answer: Both, but the claims mean different things. The official service is free to use and has no paid tier. Released software is available under AGPL-3.0-or-later, which grants rights to inspect, run, modify, share and self-host that release.
    - question: Can I self-host Split?
      answer: Yes. The public repository includes Compose, PostgreSQL migrations, schema and API documentation. You operate the domain and TLS, database, backups, secrets, upgrades, monitoring and any optional integrations.
    - question: Who maintains Split, and why can another product appear?
      answer: Squirrel Labs is currently the sole maintainer and pays every project cost, including work hours and operation of peanutsplit.com. The official service may include a few quiet, contextual settlement references; they never require a click, nag, or feature gate, and forks do not have to keep them.
faqs:
    - question: Do I need an account?
      answer: No, and neither does anyone you send the link to. There is no email, no password and no ID check anywhere in Split.
    - question: Is there a limit on how many expenses we can add?
      answer: No. Add fifty in an afternoon if that is the kind of trip it is.
    - question: Can I import my Splitwise history?
      answer: Yes. Export your group from Splitwise as a spreadsheet and drop the file on peanutsplit.com/import. The expenses, who paid and the balances all come across, and you get a room link to send the group. The file is read in your browser and never uploaded.
---

{/* Every claim about Splitwise here is a verbatim quote from a Splitwise page, each one re-opened
and checked against its text on 2026-08-21:

- https://www.splitwise.com/pro — the three Pro quotes under "Why people go looking"
- https://kb.splitwise.com/pro/what-is-splitwise-pro-and-who-can-use-it — the daily-cap quote

The ad-free line is quoted the way Splitwise sets it, as a heading with no full stop. The earlier
version of this page added one, and a full stop is punctuation we do not own. Splitwise publishes
no price anywhere on its own site, so this page states their free/paid split and never a figure.
Don't add a claim you have not opened the page for, and don't add one that rots when they change a
price. */}

<Hero
  eyebrow="splitwise alternative"
  title="A free Splitwise alternative with no signup"
  subtitle="Splitwise works. It also asks every person in the group to make an account before they can add a single expense, and that is where most groups quietly give up. Split is a link. Send it, people type a name, everyone adds what they paid."
  cta="Start a split"
  ctaHint="Takes ten seconds. No email, no password, no download." />

[Already on Splitwise? Bring your group’s history with you](/import)

<PublicSourceOnly>

## Free and open source are separate promises

The official service is free to use and has no paid tier, and that will not change: if we ever
cannot afford to run peanutsplit.com, we switch it off rather than start charging. Free forever is a
price promise, not a promise that one host will exist forever.

The released software is licensed under AGPL-3.0-or-later. Open source describes what you may do
with that release: inspect it, run it, modify it, share it and host it yourself under the licence.
It does not mean “free of charge,” and it does not promise how every future release will be licensed.

[Read the source, licence and stewardship receipts](/source)

## What you can self-host

The public source includes the Next.js application, PostgreSQL schema and migrations, a Compose
reference deployment, and generated documentation for the data model and HTTP API. The self-hosting
guide names the current boundaries too: one application replica, process-local wakeups and rate
limits, static exchange rates unless you configure a provider, and no bundled production TLS,
backups or monitoring.

Running it makes you the operator. You own the domain and TLS, database, backups, secrets, upgrades,
logs, privacy notices and every optional integration you enable. The source page links each document
and the immutable releases.

## Maintained by Squirrel Labs

Peanut Split is maintained by Squirrel Labs. Squirrel Labs is currently the sole maintainer and pays
every project cost, including maintainer work hours and operation of peanutsplit.com. The fair deal
is that the official service may carry the few quiet, contextual references described on the
[source and stewardship page](/source). They never require a click, nag the user, become preselected,
or gate a feature. Those references are part of
the official hosted service, not a condition of the AGPL licence. Forks and self-hosters do not
have to preserve the references or promote either company.

</PublicSourceOnly>

## Why people go looking

Splitwise sells a Pro tier. What Pro promises is the clearest description of what the free version does to you:

### The day you add a lot of expenses is the day it stops

<Quote source="splitwise.com/pro">
Add as many expenses as you like each day, with no interruptions.
</Quote>

A trip is exactly when you add a dozen in an afternoon. Split has no cap and no counter.

### Splitting across currencies is a paid feature

<Quote source="splitwise.com/pro">
Splitwise can convert all your bills to any currency you’d like, using today’s foreign exchange rates.
</Quote>

Also Pro. If the group is in Lisbon paying in euros and settling in pounds, that is the whole job. In Split it is built in and free to use.

### The free app shows you ads

<Quote source="splitwise.com/pro">
A totally ad-free experience
</Quote>

Pro again. Split has no paid tier.

## If the counter has already stopped you today

<Quote source="kb.splitwise.com/pro">
Add as many expenses as you need without hitting a limit (free users can add up to 4 expenses each day).
</Quote>

From Splitwise's help centre, kb.splitwise.com, read on 2026-08-21.

That is Splitwise describing its own free tier. The counter resets and you can add again tomorrow, which is no help tonight.

A group does not have to move its history to carry on. Start a room, paste the link into the group chat, and put the rest of today in there. There is no account to make, so nobody in the group has to sign up before the next expense goes in. What is already in Splitwise stays in Splitwise and stays correct. If you would rather bring the history across, export the group from Splitwise as a spreadsheet and drop the file on the import page.

Running two ledgers for one trip is worth it for the days the counter is in the way and not much longer. A group at the start of a week away is better off opening the room on day one, and a group that would rather carry the open balances over than start from today should do that in one sitting.

[What the daily cap does, and how to move a group mid-trip](/splitwise-daily-limit)

## The Splitwise alternative, plainly

|                      | Split                               | Splitwise                                            |
| -------------------- | ----------------------------------- | ---------------------------------------------------- |
| Getting started      | Open the link and type a name.      | Everyone makes an account first.                     |
| Getting the group in | Paste one link into the group chat. | Invite people one by one, and each of them signs up. |
| Adding expenses      | As many as you like, every day.     | Removing the daily cap is sold as a Pro feature.     |
| Other currencies     | Built in and free to use.           | Currency conversion is sold as a Pro feature.        |
| Cost                 | Free to use; no paid tier.          | Free with ads, or Splitwise Pro.                     |

Quotes and features taken from splitwise.com/pro and kb.splitwise.com, checked against those pages on 2026-08-21.

<Callout title="When Splitwise is the better tool">
Splitwise scans receipts, does card imports and draws charts, and it has apps in both stores. Split does none of that, on purpose. Split is for the trip, the dinner, the weekend — one group, one link, cleared and forgotten.
</Callout>

<Checklist title="What you get">
<ChecklistItem title="One link, no accounts">The link is the room. Anyone who has it is in, so keep it in the group chat and not somewhere public.</ChecklistItem>
<ChecklistItem title="156 currencies, converted">Pick what the room counts in. Add an expense in any of the 156 currencies with automatic conversion and Split converts it at the day’s indicative rate, which it then keeps — editing the line later does not re-price it.</ChecklistItem>
<ChecklistItem title="Maths that reconciles">Balances sum to zero, down to the cent, and settling up suggests a short payment plan that clears the room. Open any balance and it shows you the working.</ChecklistItem>
<ChecklistItem title="Everyone sees it as it happens">Somebody adds the taxi on the way home and it is on everyone else’s screen before they are out of the car.</ChecklistItem>
<ChecklistItem title="Keeps working with no signal">Expenses typed in a basement or up a mountain wait on your phone and go when the signal comes back. Recording a settle-up waits for a connection on purpose — a payment written down twice is worse than one written down late.</ChecklistItem>
<ChecklistItem title="Seven languages">The room speaks whichever one the phone reading it is set to: English, Spanish, Portuguese, Polish, German, French or Ukrainian. Nobody has to find a setting.</ChecklistItem>
<ChecklistItem title="Settle however you like">Cash, bank transfer, whatever app the group already uses. Split records it either way.</ChecklistItem>
</Checklist>

<CTA
  title="Try it on the next dinner"
  body="One link, ten seconds, and nobody has to install anything."
  text="Start a split" />

<FAQ title="Questions people actually ask">
<PublicSourceOnly>
<FAQItem question="Is Split FOSS or only free to use?">Both, but the claims mean different things. The official service is free to use and has no paid tier. Released software is available under AGPL-3.0-or-later, which grants rights to inspect, run, modify, share and self-host that release.</FAQItem>
<FAQItem question="Can I self-host Split?">Yes. The public repository includes Compose, PostgreSQL migrations, schema and API documentation. You operate the domain and TLS, database, backups, secrets, upgrades, monitoring and any optional integrations.</FAQItem>
<FAQItem question="Who maintains Split, and why can another product appear?">Squirrel Labs is currently the sole maintainer and pays every project cost, including work hours and operation of peanutsplit.com. The official service may include a few quiet, contextual settlement references; they never require a click, nag, or feature gate, and forks do not have to keep them.</FAQItem>
</PublicSourceOnly>
<FAQItem question="Do I need an account?">No, and neither does anyone you send the link to. There is no email, no password and no ID check anywhere in Split.</FAQItem>
<FAQItem question="Is there a limit on how many expenses we can add?">No. Add fifty in an afternoon if that is the kind of trip it is.</FAQItem>
<FAQItem question="Can I import my Splitwise history?">Yes. Export your group from Splitwise as a spreadsheet and drop the file on peanutsplit.com/import. The expenses, who paid and the balances all come across, and you get a room link to send the group. The file is read in your browser and never uploaded.</FAQItem>
</FAQ>

<RelatedPages>
<RelatedLink href="/settle-up-alternative">If the group is coming from Settle Up instead</RelatedLink>
<RelatedLink href="/tricount-alternative">How Split compares with Tricount</RelatedLink>
<RelatedLink href="/blog/split-bills-without-an-app">Splitting a bill when nobody installs anything</RelatedLink>
</RelatedPages>
