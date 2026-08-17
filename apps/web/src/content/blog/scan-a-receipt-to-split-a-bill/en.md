---
title: Scan a receipt to split a bill by item
description: Photograph the bill, check the lines it read, tap who had what. Receipt splitting is free forever, with no premium tier or account to make first.
date: 2026-07-28
v2Only: true
tags: [receipts, dinners]
faqs:
    - question: Is receipt scanning free forever?
      answer: Yes. Receipt scanning is free forever, with no premium tier or upgrade. A room can scan up to 30 bills a day, which is a limit on the cost of running it, not a tier you can buy your way out of.
    - question: Do you keep my receipt photo?
      answer: Split sends the photo to Gemini for reading, either through OpenRouter or directly. Its server does not save the image or extracted lines. If you share a photo into the installed Android app, your browser temporarily parks that one image on your device for the room handoff; it is single-use and rejected after ten minutes. What Split saves is the expense you approve at the end.
    - question: What if it reads a line wrong?
      answer: You see every line before anything is saved. Fix the text, fix the amount, delete what is not yours, add what it missed. If the lines do not add up to the printed total, it says so and shows the gap.
    - question: Do I have to scan to split by item?
      answer: No. For a short bill, enter one ordinary expense and set exact shares manually. The item-by-item assignment screen is part of receipt scanning.
---

<Hero
  eyebrow="receipts"
  title="Split a bill by item, without typing it out"
  subtitle="Six people, one bill, and three of them did not have the wine. Photograph it, check the lines, tap who had what."
  cta="Start a split"
  ctaHint="Takes ten seconds. No email, no password, no download." />

Splitting a restaurant bill evenly takes one number. Splitting it honestly takes twenty, and that is the version people give up on — somebody had the tasting menu, somebody had a salad, two people shared a bottle, and working that out at the table with a phone calculator is how "let's just do it evenly" wins.

The arithmetic was never the hard part. The typing was.

## What actually happens when you scan one

<Steps title="Three screens, and the middle one is the point">
<Step title="Photograph the bill">Straight on, whole bill in frame, lights up. It comes back with the lines it could read and the total it saw.</Step>
<Step title="Check the items">This is the screen that matters. Fix anything that came out wrong, delete what is not yours, add what was missed. If the lines do not add up to the printed total, it tells you and shows the gap, so a missed row is caught here rather than three days later.</Step>
<Step title="Tap who had what">Tap the people on each item. Two or more on the same line splits that line equally between them. The wine goes to four people, the tasting menu goes to one.</Step>
</Steps>

What lands in the room at the end is an ordinary expense with exact amounts per person — the same row you would have produced by hand, through the same tested path. Nothing about the money is special-cased because a camera was involved.

## The honest part about the photo

<Callout title="What happens to the image">
Split sends the photo to Gemini for reading, either through OpenRouter or directly. Split's server does not save the image, merchant name or extracted lines; the only thing it saves is the expense you approve on the last screen. If you share a photo into the installed Android app, your browser temporarily parks that one image in local Cache Storage while you choose or join a room. It is consumed once, rejected after ten minutes, and an expired copy is removed the next time Split runs. When OpenRouter is used, requests are restricted to providers that deny data collection and use zero data retention. Direct Gemini is enabled only for a paid-tier project; Google's terms allow temporary prompt and response logging for abuse monitoring. The model's arithmetic is not trusted either: the amounts are re-checked against the printed total before you are asked to assign anything.
</Callout>

That is also why scanning is not a login-gated feature dressed up as a premium one. There is no account, so there is nothing to attach a scan history to, and no history to sell back to you later.

## Where it is worth it, and where it is not

<Checklist title="Scan when">
<ChecklistItem title="The bill has more than about six lines">Under that, typing is faster than photographing. Over it, the camera wins every time.</ChecklistItem>
<ChecklistItem title="People ordered genuinely different things">A bill everyone shares equally does not need itemising at all — one expense, split evenly, done.</ChecklistItem>
<ChecklistItem title="The receipt is printed and flat">Handwritten totals, crumpled thermal paper and a photo taken at an angle are the three things that cost you a correction.</ChecklistItem>
</Checklist>

If the "Scan receipt" button is not in your room, scanning is unavailable on that deployment. You can still enter the total as an ordinary expense and set each person's exact share manually.

## Free forever, and what that means here

Splitwise puts itemised receipt scanning behind Pro, and Settle Up sells [receipt photos on a paid tier of its own](/guides/splitwise-vs-settle-up). This does not, and there is no tier to move you onto later — Split is made by Peanut and exists to introduce people to it, which is how it gets paid for.

There is one number worth knowing: a room can scan 30 bills a day. That is a ceiling on what a single room can cost to run, not a plan you can upgrade past, and no dinner has ever come close to it.

<CTA
  title="Try it on the next long bill"
  body="Start a room, add the people, and photograph whatever arrives at the end of the meal."
  text="Start a split" />

<FAQ>
<FAQItem question="Is receipt scanning free forever?">Yes. Receipt scanning is free forever, with no premium tier or upgrade. A room can scan up to 30 bills a day, which is a limit on the cost of running it, not a tier you can buy your way out of.</FAQItem>
<FAQItem question="Do you keep my receipt photo?">Split sends the photo to Gemini for reading, either through OpenRouter or directly. Its server does not save the image or extracted lines. If you share a photo into the installed Android app, your browser temporarily parks that one image on your device for the room handoff; it is single-use and rejected after ten minutes. What Split saves is the expense you approve at the end.</FAQItem>
<FAQItem question="What if it reads a line wrong?">You see every line before anything is saved. Fix the text, fix the amount, delete what is not yours, add what it missed. If the lines do not add up to the printed total, it says so and shows the gap.</FAQItem>
<FAQItem question="Do I have to scan to split by item?">No. For a short bill, enter one ordinary expense and set exact shares manually. The item-by-item assignment screen is part of receipt scanning.</FAQItem>
</FAQ>

<RelatedPages>
<RelatedLink href="/blog/split-expenses-in-real-time">Everyone watching the same total, live</RelatedLink>
<RelatedLink href="/blog/split-bills-without-an-app">Splitting bills without making anyone sign up</RelatedLink>
<RelatedLink href="/splitwise-alternative">How Split compares to Splitwise</RelatedLink>
</RelatedPages>
