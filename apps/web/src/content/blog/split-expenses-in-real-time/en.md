---
title: 'How shared expenses update'
description: 'Expenses and balances update on the group’s phones without a refresh. Learn what happens when someone loses their connection.'
date: 2026-07-28
type: guide
tags: [groups, live]
claims:
    - no-app
    - settle-is-a-record
    - link-is-the-key
    - live-room-stream
cast: []
faqs:
    - question: 'Do I have to refresh to see someone’s expense?'
      answer: 'An open Split room fetches changes automatically, so you normally do not need to refresh the page. A poor connection can delay the update.'
    - question: 'How often does the room check for changes?'
      answer: 'While the update stream is open, it also checks every 45 seconds. If that stream drops, it checks about every eight seconds while trying to reconnect.'
    - question: 'Can two people add expenses at once?'
      answer: 'Yes. Both entries can be saved, and the balances are recalculated from the shared expense list.'
---

<Hero
  eyebrow="guide"
  title="Keep the group’s expense list up to date"
  subtitle="Changes appear on other connected phones without anyone reloading the page."
  cta="Start a split"
  ctaHint="No email, no password, no download." />

When someone adds an expense in Peanut Split, it normally appears on other connected phones a second or two later. Each open room updates its expense list and balances automatically.

You can check what has been added while everyone is still together. That helps you spot a missing receipt or a duplicate before paying each other back.

## Check the shared list before adding a bill

Keep the room link in the group chat so everyone can find the same list. After adding an expense, check the amount, payer and people sharing it. If someone else paid, give them a chance to enter it before doing it for them.

Automatic updates help you see what is already there, but they cannot tell whether two similar entries are the same purchase. Review possible duplicates before removing anything.

Two people can add different expenses at the same time. After the entries reach the server, the room recalculates balances from the full list.

## If a phone loses its connection

A disconnected phone may show an older copy of the room. Split keeps trying to reconnect in the background and fetches the current list when it can reach the server again.

If an expense has not appeared, check the connection before entering it a second time. For adding a new expense with no signal, see [how the offline queue works](/blog/split-expenses-offline).

## Check payments separately

A payment appearing in the room means someone recorded it. Split does not check a bank account or verify that money arrived. If a transfer is delayed, ask the recipient to check before treating it as received.

Use your group chat for questions about a bill or the agreed division. The room keeps the amounts together; there is no message thread for discussing them.

<CTA
  title="Open a room for your group"
  body="Share the link so everyone can check the expense list."
  text="Start a split" />

<FAQ title="Questions">
<FAQItem question="Do I have to refresh to see someone’s expense?">An open Split room fetches changes automatically, so you normally do not need to refresh the page. A poor connection can delay the update.</FAQItem>
<FAQItem question="How often does the room check for changes?">While the update stream is open, it also checks every 45 seconds. If that stream drops, it checks about every eight seconds while trying to reconnect.</FAQItem>
<FAQItem question="Can two people add expenses at once?">Yes. Both entries can be saved, and the balances are recalculated from the shared expense list.</FAQItem>
</FAQ>

<RelatedPages>
<RelatedLink href="/blog/split-expenses-offline">Add expenses offline</RelatedLink>
<RelatedLink href="/blog/split-a-group-trip-across-countries">Split trip expenses across countries</RelatedLink>
<RelatedLink href="/blog/split-bills-without-an-app">Split bills without an app</RelatedLink>
</RelatedPages>
