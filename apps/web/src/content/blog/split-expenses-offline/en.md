---
title: 'Add shared expenses offline'
description: 'Add an expense without a connection and send it when you reconnect. Learn what stays on your device, the queue limit and which actions need internet.'
date: 2026-07-28
type: guide
tags: [offline, trips]
claims:
    - no-app
    - offline-creates-only
    - settle-is-a-record
    - link-is-the-key
    - offline-queue-30
cast: []
faqs:
    - question: 'Will a waiting expense appear on another phone?'
      answer: 'A queued expense stays on the device where you entered it and appears on other phones only after it is sent to the room.'
    - question: 'Can I close the browser before the expense sends?'
      answer: 'Yes. The queue is stored on your device and survives a reload. Open Split again with a connection to send any expenses still waiting.'
    - question: 'Can I record a payment offline?'
      answer: 'No. Editing, deleting and recording payments need a connection. If an action fails while offline, reconnect and try again.'
---

<Hero
  eyebrow="guide"
  title="Add expenses when you have no signal"
  subtitle="New expenses wait on your device until you can reconnect."
  cta="Start a split"
  ctaHint="No email, no password, no download." />

You can add a new expense in Peanut Split without an internet connection, provided you have already opened the room on that device. The expense waits locally and is sent when the room can connect again.

Other people cannot see a waiting expense yet. Its queued label tells you it still needs to reach the shared room.

<Steps title="Before and after losing signal">
<Step title="Open the room while online">Load the room on the device you will use. Keep the room link somewhere you can find again.</Step>
<Step title="Add the expense">Enter the amount, payer and people sharing it. While offline, the new row is marked as queued.</Step>
<Step title="Check it after reconnecting">Open Split when you have signal. Waiting expenses send one at a time in the order you entered them. Check for any item that needs review before leaving the room.</Step>
</Steps>

## The queue stays on your device

Queued expenses survive a page reload and a restart of Split from your home screen. They have not reached the server, so opening the room on another phone will not show them.

The queue holds up to thirty expenses per device across all rooms. If it fills up, the oldest expense that is not blocked for review is dropped and you are told. If all thirty need review, a new expense cannot be added to the queue.

For a long period without signal, a shared note or paper list can be a useful extra record. Include the amount, currency, payer and who shares the cost so you can enter it later.

## Editing and recording payments need a connection

Offline queuing covers new expenses only. You need to reconnect to edit or delete an expense, or to record a repayment. These actions ask you to retry instead of saving a change to send later.

A repayment recorded twice would change the balances incorrectly. For example, two records of a €40 payment would count €80. Wait until you are online and check whether the payment is already in the list before recording it.

Split records that someone said they paid. It does not move the money or verify it with a bank.

<CTA
  title="Open your room before heading out"
  body="Load the shared list while you have a connection."
  text="Start a split" />

<FAQ title="Questions">
<FAQItem question="Will a waiting expense appear on another phone?">A queued expense stays on the device where you entered it and appears on other phones only after it is sent to the room.</FAQItem>
<FAQItem question="Can I close the browser before the expense sends?">Yes. The queue is stored on your device and survives a reload. Open Split again with a connection to send any expenses still waiting.</FAQItem>
<FAQItem question="Can I record a payment offline?">No. Editing, deleting and recording payments need a connection. If an action fails while offline, reconnect and try again.</FAQItem>
</FAQ>

<RelatedPages>
<RelatedLink href="/blog/split-a-group-trip-across-countries">Split trip expenses across countries</RelatedLink>
<RelatedLink href="/blog/split-expenses-in-real-time">How shared expenses update</RelatedLink>
<RelatedLink href="/blog/split-bills-without-an-app">Split bills without an app</RelatedLink>
</RelatedPages>
