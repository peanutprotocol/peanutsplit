---
title: 'Scan a receipt to split a bill by item'
description: 'Photograph a receipt, check the amounts and assign items to the people who shared them. See the scan limit and how the photo is handled.'
date: 2026-07-28
type: guide
v2Only: true
tags: [receipts, dinners]
claims:
    - no-app
    - hosted-price
    - link-is-the-key
    - receipt-scan-30-a-day
    - receipt-photo-handling
cast: []
faqs:
    - question: 'Do I need an account to scan a receipt?'
      answer: 'You can scan a receipt in Split without an account. Join the room through its link and use the Scan receipt button if it is available.'
    - question: 'What if the scan misses a line?'
      answer: 'Add the missing item on the review screen before assigning shares. You can also correct amounts or delete an incorrect line.'
    - question: 'Can I divide an item between several people?'
      answer: 'Yes. Select everyone who shared that line and its amount is divided equally among them.'
---

<Hero
  eyebrow="guide"
  title="Scan a receipt and split the bill by item"
  subtitle="Review the receipt lines, then choose who shares each item."
  cta="Start a split"
  ctaHint="No email, no password, no download." />

To split a bill by item in Peanut Split, photograph the receipt, check what it read and assign each item to the people who had it. The expense is saved only after you approve it.

Itemising helps when people ordered different meals or only some shared the drinks. If everyone is paying an equal share, enter the total as one ordinary expense.

<Steps title="Scan and check the bill">
<Step title="Take a clear photo">Keep the full receipt in the frame, with enough light to read it. Flatten folds and avoid an angle that makes the print hard to see.</Step>
<Step title="Review the lines">Correct descriptions and amounts, remove incorrect lines and add anything missing. Split compares the sum with the printed total and shows a difference if they do not match.</Step>
<Step title="Assign the items">Select the people who shared each line. Selecting several people divides that item equally between them. Review the amounts per person before saving.</Step>
</Steps>

## When manual entry is easier

For a short receipt, typing the total and setting exact shares may take less work than checking a scan. This also works if the print is too faded to read.

If the room has no Scan receipt button, scanning is unavailable on that deployment. You can still add an ordinary expense and set each person's exact share manually.

## What happens to the photo

Split sends the photo to Gemini for reading, either through OpenRouter or directly. Split's server does not save the image, merchant name or extracted lines. It saves the expense you approve.

Through OpenRouter, requests require providers that deny data collection and use zero data retention. Direct Gemini is enabled only for a paid-tier project. Google's terms allow temporary prompt and response logging for abuse monitoring.

If you share a photo into Split from Android after adding the website to your home screen, the browser temporarily keeps it on your device while you choose a room. That copy can be used once and is rejected after ten minutes. An expired copy is cleared the next time Split starts.

## Scanning limits

Receipt scanning is free to use. A room can scan up to 30 bills a day; the allowance refills gradually rather than resetting at midnight. There is no paid upgrade to increase it.

<CTA
  title="Try scanning a receipt"
  body="Open a room and check the items before saving the expense."
  text="Start a split" />

<FAQ title="Questions">
<FAQItem question="Do I need an account to scan a receipt?">You can scan a receipt in Split without an account. Join the room through its link and use the Scan receipt button if it is available.</FAQItem>
<FAQItem question="What if the scan misses a line?">Add the missing item on the review screen before assigning shares. You can also correct amounts or delete an incorrect line.</FAQItem>
<FAQItem question="Can I divide an item between several people?">Yes. Select everyone who shared that line and its amount is divided equally among them.</FAQItem>
</FAQ>

<RelatedPages>
<RelatedLink href="/blog/split-expenses-in-real-time">How shared expenses update</RelatedLink>
<RelatedLink href="/blog/split-bills-without-an-app">Split bills without an app</RelatedLink>
<RelatedLink href="/splitwise-alternative">How Split compares to Splitwise</RelatedLink>
</RelatedPages>
