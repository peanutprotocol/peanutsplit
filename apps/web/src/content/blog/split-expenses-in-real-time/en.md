---
title: Splitting expenses in real time
description: Everyone watching the same total on their own phone, with nobody refreshing. What a live shared expense list fixes at the table, and what it still cannot do.
date: 2026-07-28
tags: [groups, live]
claims:
    - settle-is-a-record
    - link-is-the-key
faqs:
    - question: Do the other people have to refresh to see my expense?
      answer: No. Every open room holds a stream, and an expense you add shows up on the other phones a second or two later. Nobody has to reload, and nobody has to be told to.
    - question: What happens if somebody's connection drops?
      answer: Their room keeps checking on its own, about every eight seconds, and reconnects the stream in the background. When it comes back they are already up to date — there is no "stale room" state to get stuck in.
    - question: Can two people add an expense at the same time?
      answer: Yes. Both land, both show up for everyone, and the balances are recomputed from the whole list rather than nudged, so two simultaneous writes cannot leave a total that is nearly right.
    - question: Does live updating drain my battery?
      answer: It should not. While the stream is open the room stops polling on a short timer and only checks every 45 seconds as a backstop, so an open room is cheaper than one hammering the server for changes.
---

<Hero
  eyebrow="live"
  title="Everyone looking at the same number"
  subtitle="Six people, one evening, and four of them are adding things. A shared list that only updates when you pull it down is a list people argue with."
  cta="Start a split"
  ctaHint="Takes ten seconds. No email, no password, no download." />

There is a specific round of messages that happens on every trip, and it is not about money. It is about state.

"Did you put in the taxi?" "I did it earlier." "I don't see it." "Try refreshing." "Still nothing." Somebody adds it again. Now it is in twice, and the person who notices is the person who has to explain it.

None of that is an arithmetic problem. It is four people looking at four slightly different copies of the same list.

## What "live" means in a room

Every open room holds a stream to the server. When anyone adds an expense, edits one, records a payment, reacts to something or changes the room's colours, the other phones are poked and pull the room again — a second or two, no refresh, no tap.

<Steps title="What that changes at the table">
<Step title="Nobody asks whether it landed">The person who added it sees it on the list; so does everyone else, at the same time. The question stops being asked because the answer is on screen.</Step>
<Step title="Nothing gets entered twice">Duplicates come from doubt. When the taxi is visibly there, nobody adds the taxi again.</Step>
<Step title="The totals are true while you are still in the room">You can settle up standing at the table instead of three days later, because the number in front of everyone is the current one.</Step>
</Steps>

## What happens when the connection is bad

This is the part that decides whether "real time" is a feature or a liability. A room that depends on its stream is a room that silently goes stale in a lift.

<Callout title="The stream is never the only way in">
Polling never goes away. While the stream is genuinely open, the room stretches to checking every 45 seconds — the stream is doing the work, so the timer is only a backstop. The moment the stream is down, that drops to every eight seconds, and the reconnection is attempted in the background with a growing, randomised delay so a server that restarts does not get every phone in every room back at the same millisecond.
</Callout>

The effect is that there is no stale state to get stuck in and nothing to tap to recover. A phone that was in a tunnel for ten minutes catches up on its own.

## What live updating does not fix

<Checklist title="Still true, and worth saying">
<ChecklistItem title="A room is not a chat">There is no message thread, by decision. You get reactions on expenses and that is the whole social surface — the conversation is already happening in the group chat you pasted the link into.</ChecklistItem>
<ChecklistItem title="Live is not the same as verified">Watching a payment appear means somebody recorded it, not that a bank moved anything. No expense splitter is watching your account, and it is worth knowing which of the two you are looking at.</ChecklistItem>
<ChecklistItem title="Somebody still has to type it">The bill does not add itself. Live updating makes everyone see an expense quickly; it does not decide what the expense should say.</ChecklistItem>
</Checklist>

<CTA
  title="Paste one link, watch one list"
  body="Everyone opens the same room and adds what they paid. No accounts, no invitations one at a time, nothing to refresh."
  text="Start a split" />

<FAQ>
<FAQItem question="Do the other people have to refresh to see my expense?">No. Every open room holds a stream, and an expense you add shows up on the other phones a second or two later.</FAQItem>
<FAQItem question="What happens if somebody's connection drops?">Their room keeps checking on its own, about every eight seconds, and reconnects the stream in the background. When it comes back they are already up to date.</FAQItem>
<FAQItem question="Can two people add an expense at the same time?">Yes. Both land, both show up for everyone, and the balances are recomputed from the whole list rather than nudged, so two simultaneous writes cannot leave a total that is nearly right.</FAQItem>
<FAQItem question="Does live updating drain my battery?">It should not. While the stream is open the room stops polling on a short timer and only checks every 45 seconds as a backstop.</FAQItem>
</FAQ>

<RelatedPages>
<RelatedLink href="/blog/split-expenses-offline">Adding expenses where there is no signal</RelatedLink>
<RelatedLink href="/blog/split-a-group-trip-across-countries">Splitting a trip across countries and currencies</RelatedLink>
<RelatedLink href="/blog/split-bills-without-an-app">Splitting bills without making anyone sign up</RelatedLink>
</RelatedPages>
