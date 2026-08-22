---
title: The end-of-trip expense recap
description: What the week actually cost, how many days it ran and who fronted the most. One card to put in the group chat when the trip is over and everyone is square.
date: 2026-07-28
type: guide
tags: [trips, recap]
claims:
    - link-is-the-key
    - settle-is-a-record
    - recap-card
cast: []
faqs:
    - question: What is on the recap?
      answer: The room's total spend, how many days it ran, how many expenses and people were in it, how many payments got recorded, and who fronted the most money. It carries a settled stamp once everybody is square.
    - question: Can I share the recap as a link?
      answer: No, and that is on purpose. A room's address is also its key. Anyone who opens the recap URL can drop the last part of it and land in a ledger they can write to. So the recap is shared as an image instead.
    - question: When can I share it?
      answer: Once the room actually reaches zero. You can look at a recap of so far at any point during the trip, but the share button waits for settled, because a card stamped "settled" on a room that is 400 apart would be a lie.
    - question: Does the card show anyone's balance?
      answer: No. It shows what the group spent together and who fronted the most, not what any one person owes. What ends up in a group chat should be a souvenir, not somebody's debt.
---

<Hero
  eyebrow="trips"
  title="What the trip actually cost, in one card"
  subtitle="Nine days, fourteen expenses, six people, all square. The last thing a shared expense room owes you is a summary you would want to send to the group."
  cta="Start a split"
  ctaHint="Takes ten seconds. No email, no password, no download." />

Splitting expenses ends badly even when it ends correctly. The last message in the group is usually somebody confirming a transfer, and then the whole thing evaporates — nobody ever finds out what the week cost, and the person who fronted the villa deposit in March never gets so much as an acknowledgement.

That is a strange place to stop, given the room has been counting the entire time.

## What the recap is

<Checklist title="Six things off the room, no typing">
<ChecklistItem title="Total spent">Everything the group put through the room, in the room's own currency.</ChecklistItem>
<ChecklistItem title="How long it ran">Calendar days from the first expense to the last, both ends included. Counted the same way wherever the person reading it is, so nobody's copy says nine days and somebody else's says ten.</ChecklistItem>
<ChecklistItem title="Expenses and people">The shape of the trip in two numbers.</ChecklistItem>
<ChecklistItem title="Payments recorded">How many settle-ups were logged getting from "we owe each other things" to zero.</ChecklistItem>
<ChecklistItem title="Who fronted the most">The person who put the most on their own card. Not who spent the most on themselves: who carried the group.</ChecklistItem>
<ChecklistItem title="A settled stamp">Only once everybody is genuinely square, and only when there was something to square in the first place. An empty room is not settled, it is empty.</ChecklistItem>
</Checklist>

You can look at it mid-trip too, marked as "so far". The share button is the part that waits.

## Why it is an image and not a link

This is the design decision worth explaining, because "share your recap" would be much easier to build as a URL and it would be the wrong thing.

<Callout title="The room's address is the room's key">
There is no login. A room link is the credential — whoever holds it can open the room, join it, and add expenses. The recap screen lives under the room's own address, so anyone who got the recap URL could delete the last part of it and be standing in the group's ledger with a pen. Posting that to a story or a public thread would be handing it to strangers.
</Callout>

So what gets shared is a picture. The card is generated as an image, handed to your phone's normal share sheet, and it prints the product's domain rather than the room's address. Nothing that could open your room leaves the group — and the file it saves is named for the product, not the room, so the slug does not end up in a downloads folder or a screenshot of a file picker either.

The trade is honest: someone who sees the card cannot click into your trip. That is the point. If they want their own, the domain is on the card.

## Getting to a recap worth sharing

<Steps title="Three habits that make the card true">
<Step title="One room per trip, not per person">Start it before the first booking, put the deposit in it, and let the flights and the villa land in the same place as the dinners. A room that starts on day two undercounts the trip.</Step>
<Step title="Add things as they happen">Not from a bank statement afterwards. The day count comes off the expense dates, and the recap of a week reconstructed on the flight home says one day.</Step>
<Step title="Record the payments">Settling is one tap on the person you paid. Miss it and the room never reaches zero, so the card never gets its stamp and nobody gets the moment.</Step>
</Steps>

<CTA
  title="Start the room before the trip does"
  body="One link in the group chat, everyone adds what they paid, and there is something to look at when you get home."
  text="Start a split" />

<FAQ>
<FAQItem question="What is on the recap?">The room's total spend, how many days it ran, how many expenses and people were in it, how many payments got recorded, and who fronted the most money. It carries a settled stamp once everybody is square.</FAQItem>
<FAQItem question="Can I share the recap as a link?">No, and that is on purpose. A room's address is also its key. Anyone who opens the recap URL can drop the last part of it and land in a ledger they can write to. So the recap is shared as an image instead.</FAQItem>
<FAQItem question="When can I share it?">Once the room actually reaches zero. You can look at a recap of so far at any point during the trip, but the share button waits for settled.</FAQItem>
<FAQItem question="Does the card show anyone's balance?">No. It shows what the group spent together and who fronted the most, not what any one person owes.</FAQItem>
</FAQ>

<RelatedPages>
<RelatedLink href="/blog/split-a-group-trip-across-countries">Splitting a trip when nobody shares a bank</RelatedLink>
<RelatedLink href="/blog/split-expenses-offline">Adding expenses where there is no signal</RelatedLink>
<RelatedLink href="/blog/split-expenses-across-currencies">Splitting when you paid in one currency and owe in another</RelatedLink>
</RelatedPages>
