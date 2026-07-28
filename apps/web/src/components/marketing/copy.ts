/**
 * What is left of the marketing copy after i18n: the Splitwise comparison page, and only it.
 *
 * Everything else that used to live here — hero, rooms, how-it-works, honesty strip, footer,
 * install prompt — moved into `src/i18n/messages/*.json` and is rendered through
 * `useTranslations`. The key paths here were already namespaced for exactly that move.
 *
 * This page did NOT move, deliberately. It is the one SEO page: its `<title>`, its description
 * and its FAQPage JSON-LD are all built from these strings at module scope, and the structured
 * data has to match what a crawler is served. Rendering the body in Spanish while the JSON-LD
 * stayed English would be a rich-result mismatch on the highest-intent page on the site. It is
 * English because it is indexed in English — the same reason the OG images are.
 *
 * Rules for whoever edits this: keep it honest. Free forever is a promise, not a growth line;
 * "settle however you like" must never imply the Peanut path is safer than cash.
 */
export const marketingCopy = {
    /**
     * The one SEO page (decision log, 2026-07-25: "LP + one strong Splitwise alternative page").
     * Every claim about Splitwise here was checked against their own site in July 2026 and is
     * quoted rather than characterised. Don't add a claim you haven't opened the page for, and
     * don't add one that needs updating when they change a price.
     */
    compare: {
        meta: {
            title: 'Free Splitwise alternative — no signup, no daily limit',
            description:
                'A free Splitwise alternative with no account and no app: share one link, everyone adds what they paid, and nothing is capped or held back for a paid tier.',
        },
        hero: {
            eyebrow: 'splitwise alternative',
            title: 'Split the bill without making everyone sign up',
            body: 'Splitwise works. It also asks every person in the group to make an account before they can add a single expense, and that is where most groups quietly give up. Peanut Split is a link. Send it, people type a name, everyone adds what they paid.',
            cta: 'Start a split',
            ctaHint: 'Takes ten seconds. No email, no password, no download.',
        },
        /**
         * Three reasons that match what people actually search after hitting a wall in
         * Splitwise. Each one quotes Splitwise's own Pro page rather than characterising
         * their product, so the section stays true whatever they charge next year.
         */
        why: {
            title: 'Why people go looking',
            intro: 'Splitwise sells a Pro tier. What Pro promises is the clearest description of what the free version does to you:',
            items: [
                {
                    title: 'The day you add a lot of expenses is the day it stops',
                    quote: 'Add as many expenses as you like each day, with no interruptions.',
                    body: 'That is Pro’s pitch for “unlimited expenses”, which tells you the free tier counts. A trip is exactly when you add a dozen in an afternoon. Split has no cap and no counter.',
                },
                {
                    title: 'Splitting across currencies is a paid feature',
                    quote: 'Splitwise can convert all your bills to any currency you’d like, using today’s foreign exchange rates.',
                    body: 'Also Pro. If the group is in Lisbon paying in euros and settling in pounds, that is the whole job. In Split it is free and built in.',
                },
                {
                    title: 'The free app shows you ads',
                    quote: 'A totally ad-free experience.',
                    body: 'Pro again. Split has no ads and no paid tier to sell you, because it is not how Peanut makes money.',
                },
            ],
        },
        table: {
            title: 'The difference, plainly',
            splitLabel: 'Peanut Split',
            otherLabel: 'Splitwise',
            rows: [
                {
                    feature: 'Getting started',
                    split: 'Open the link and type a name.',
                    other: 'Everyone makes an account first.',
                },
                {
                    feature: 'Getting the group in',
                    split: 'Paste one link into the group chat.',
                    other: 'Invite people one by one, and each of them signs up.',
                },
                {
                    feature: 'Adding expenses',
                    split: 'As many as you like, every day.',
                    other: 'Unlimited expenses are sold as a Pro feature.',
                },
                {
                    feature: 'Other currencies',
                    split: 'Built in and free.',
                    other: 'Currency conversion is sold as a Pro feature.',
                },
                {
                    feature: 'Cost',
                    split: 'Free, with no paid tier to upgrade to.',
                    other: 'Free with ads, or Splitwise Pro.',
                },
            ],
            footnote: 'Quotes and features taken from splitwise.com/pro in July 2026.',
        },
        /**
         * The concession. Every credible comparison page has one, and leaving it out is how a
         * page reads like marketing. It is also true: Split is deliberately small.
         */
        honest: {
            title: 'When Splitwise is the better tool',
            body: 'If you want a permanent ledger with your flatmates, receipt scanning, card imports and charts, Splitwise does all of that and Split does none of it. Split is for the trip, the dinner, the weekend — one group, one link, cleared and forgotten.',
        },
        features: {
            title: 'What you get',
            items: [
                {
                    title: 'One link, no accounts',
                    body: 'The link is the room. Anyone who has it is in, so keep it in the group chat and not somewhere public.',
                },
                {
                    title: 'More than one currency',
                    body: 'Pick what the room counts in. Add an expense in another currency and Split converts it.',
                },
                {
                    title: 'Maths that reconciles',
                    body: 'Balances sum to zero, down to the cent, and settling up suggests the fewest transfers that clear the room.',
                },
                {
                    title: 'Settle however you like',
                    body: 'Cash, bank transfer, whatever app the group already uses. Split records it either way.',
                },
            ],
        },
        faq: {
            title: 'Questions people actually ask',
            items: [
                {
                    q: 'Do I need an account?',
                    a: 'No, and neither does anyone you send the link to. There is no email, no password and no ID check anywhere in Split.',
                },
                {
                    q: 'Is it really free?',
                    a: 'Yes, and there is nothing to upgrade to. Split is made by Peanut and exists to introduce people to it, which is how it gets paid for.',
                },
                {
                    q: 'Is there a limit on how many expenses we can add?',
                    a: 'No. Add fifty in an afternoon if that is the kind of trip it is.',
                },
                {
                    q: 'Do we have to download an app?',
                    a: 'No. It opens in a browser like any other page. If you want it to feel like an app, add it to your home screen — that is a phone feature, not an install.',
                },
                {
                    q: 'Can I import my Splitwise history?',
                    a: 'No. Split has no import. Start a room for the next trip or the next month rather than moving old balances across.',
                },
                {
                    q: 'What happens if we lose the link?',
                    a: 'Rooms you have opened are saved on your device and listed on the home page. If nobody in the group still has the link, the room is gone — that is the trade for not having accounts.',
                },
                {
                    q: 'Does it work on my phone?',
                    a: 'It is a website, so it works anywhere. You can add it to your home screen and it opens like an app.',
                },
            ],
        },
        cta: {
            title: 'Try it on the next dinner',
            body: 'One link, ten seconds, and nobody has to install anything.',
            button: 'Start a split',
        },
    },
} as const
