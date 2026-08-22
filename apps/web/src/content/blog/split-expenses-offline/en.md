---
title: Splitting expenses offline, with no signal
description: Basements, ski lifts, festival fields and dead SIMs. What a shared expense room can record with no connection, what it deliberately refuses to, and why.
date: 2026-07-28
type: guide
tags: [offline, trips]
claims:
    - offline-creates-only
    - settle-is-a-record
    - link-is-the-key
    - offline-queue-30
cast: []
faqs:
    - question: Can I add an expense with no internet?
      answer: Yes. The expense is saved on your phone with a "queued" mark on the row and sends itself the moment you are back online. You do not have to remember it, retype it, or keep the tab open.
    - question: What happens to a queued expense if I close the app?
      answer: It waits. The queue lives on your device and survives a reload, a tab close and a restart of the installed app. It sends in the order you typed things in, never in parallel, so the room's history stays in the right order.
    - question: Can I settle up offline?
      answer: No, and that is deliberate. A payment queued on a phone in a tunnel, while the same payment gets recorded at the table by someone with signal, is a double payment written down as fact. Recording a payment needs a live connection.
    - question: Is there a limit to how much I can queue?
      answer: Thirty expenses per device, which is a whole evening of receipts. Past that the oldest is dropped and you are told, because a queue with no ceiling is a storage error later that fails silently and takes everything with it.
---

<Hero
  eyebrow="offline"
  title="Adding expenses where there is no signal"
  subtitle="Basement restaurants, ski lifts, festival fields, a SIM that gave up at the border. The moment you actually need to write the number down is usually the moment you cannot."
  cta="Start a split"
  ctaHint="Takes ten seconds. No email, no password, no download." />

The places where a group spends money together are, with impressive consistency, the places with the worst connectivity anyone encounters. A cellar bar with two bars of nothing. The lift queue. Somewhere over the Atlantic. A festival where forty thousand phones are all fighting over one mast.

And the failure mode is worse than annoying. You type in the €47 taxi, the save fails, the drawer says it could not reach the server, and now the only copy of that number is you remembering it. Nobody remembers it.

## What a queued expense actually does

The expense is written to your own phone, appears in the room's list with a "queued" mark on it, and sends itself the moment there is a connection again. You can close the tab. You can close the installed app. You can put the phone in a pocket for four hours and get on a plane.

<Steps title="What happens in order">
<Step title="You type it, with no signal">The expense is saved on the device and the row appears immediately, marked as waiting. Nothing is lost and nothing has to be remembered.</Step>
<Step title="The connection comes back">The queue drains by itself, one expense at a time, in the order you typed them — never in parallel, so the room's history reads the way the evening actually went.</Step>
<Step title="Everyone else sees them arrive">The other people in the room get the expenses as they land, in that order. Nobody has to be told to refresh.</Step>
</Steps>

<Callout title="Where the ceiling is">
Thirty waiting expenses per device. Past that the oldest is dropped and you are told so out loud. An unbounded queue is a storage-quota error somewhere down the line, and that one fails silently and takes the whole queue with it — a limit you can see beats a limit you find out about afterwards.
</Callout>

## What deliberately does not queue

Only new expenses wait. Editing an expense, deleting one, and recording a payment all still need a live connection, and the line between the two groups is money rather than effort.

<Checklist title="Why the line is drawn there">
<ChecklistItem title="A new expense is still true when it lands late">"Ana paid €47 for the taxi" does not stop being a fact because the room moved on while you were underground. Worst case it arrives out of the moment.</ChecklistItem>
<ChecklistItem title="An edit replayed over someone else's edit is a silent overwrite">Two people fixing the same row while one of them is offline ends with one change quietly gone and no conflict shown anywhere.</ChecklistItem>
<ChecklistItem title="A payment replayed is a double payment">You queue "I paid Bea €40" in a tunnel. Bea gets the cash at the table and somebody records it there. Both land. The room now believes €80 moved. Money says no.</ChecklistItem>
</Checklist>

That last one is the whole reason the feature is shaped this way. A splitter that queues everything looks more capable in a feature list and is worse at the only job that matters.

## Being usable offline is not the same as working offline

Two honest limits, because the difference gets oversold everywhere else.

You need a connection to **open** a room the first time on a device — the room lives on a server, not in the link. Once it is open, it is installable as an app, and the numbers you already loaded stay on screen. And a queued expense is on **one** device: it is not in the room, and nobody else can see it, until it sends.

So the offline story is "keep typing, nothing is lost", not "the group ledger works in a Faraday cage". The first one is the one that actually happens on a trip, and if you genuinely need the second, [Settle Up runs without a connection and says so on its own listing](/guides/splitwise-vs-settle-up).

<CTA
  title="Start the room before you lose signal"
  body="Open it once with a connection, share the link, and everyone can keep adding from wherever they end up."
  text="Start a split" />

<FAQ>
<FAQItem question="Can I add an expense with no internet?">Yes. The expense is saved on your phone with a "queued" mark on the row and sends itself the moment you are back online. You do not have to remember it, retype it, or keep the tab open.</FAQItem>
<FAQItem question="What happens to a queued expense if I close the app?">It waits. The queue lives on your device and survives a reload, a tab close and a restart of the installed app. It sends in the order you typed things in, never in parallel.</FAQItem>
<FAQItem question="Can I settle up offline?">No, and that is deliberate. A payment queued on a phone in a tunnel, while the same payment gets recorded at the table by someone with signal, is a double payment written down as fact.</FAQItem>
<FAQItem question="Is there a limit to how much I can queue?">Thirty expenses per device, which is a whole evening of receipts. Past that the oldest is dropped and you are told, because a queue with no ceiling is a storage error later that fails silently.</FAQItem>
</FAQ>

<RelatedPages>
<RelatedLink href="/blog/split-a-group-trip-across-countries">Splitting a trip when nobody shares a bank</RelatedLink>
<RelatedLink href="/blog/split-expenses-in-real-time">Everyone watching the same total, live</RelatedLink>
<RelatedLink href="/blog/split-bills-without-an-app">Splitting bills without making anyone sign up</RelatedLink>
</RelatedPages>
