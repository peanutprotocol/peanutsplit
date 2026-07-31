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
            title: 'Splitwise alternative, free forever — no signup, no daily limit',
            description:
                'A Splitwise alternative that is free forever, with no account and no app: share one link, everyone adds what they paid, and nothing is capped or held back for a paid tier.',
        },
        hero: {
            eyebrow: 'splitwise alternative',
            title: 'Split the bill without making everyone sign up',
            body: 'Splitwise works. It also asks every person in the group to make an account before they can add a single expense, and that is where most groups quietly give up. Split by Peanut is a link. Send it, people type a name, everyone adds what they paid.',
            cta: 'Start a split',
            ctaHint: 'Takes ten seconds. No email, no password, no download.',
            importLink: 'Already on Splitwise? Bring your group’s history with you',
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
                    body: 'A trip is exactly when you add a dozen in an afternoon. Split has no cap and no counter.',
                },
                {
                    title: 'Splitting across currencies is a paid feature',
                    quote: 'Splitwise can convert all your bills to any currency you’d like, using today’s foreign exchange rates.',
                    body: 'Also Pro. If the group is in Lisbon paying in euros and settling in pounds, that is the whole job. In Split it is built in and free forever.',
                },
                {
                    title: 'The free app shows you ads',
                    quote: 'A totally ad-free experience.',
                    body: 'Pro again. Split has no ads and no paid tier to sell you, because it is not how Peanut makes money.',
                },
            ],
        },
        /**
         * The cap, stated once, next to the first-party sentence that states it.
         *
         * Checked against kb.splitwise.com/pro/what-is-splitwise-pro-and-who-can-use-it on
         * 2026-07-31 (`splitwise-free-daily-cap` in `_system/competitor-claims.md`). The number
         * belongs to this section and nowhere else on the page: the table row and the FAQ keep the
         * paid-tier fact without repeating the figure (§6.16.3, restated proof point).
         *
         * The section is the rescue action only. The correction ("four, not three"), the ways out
         * Splitwise itself publishes and the full balance move all live on /splitwise-daily-limit,
         * so nothing here restates them (§6.17) — `moreHref` is how the reader gets to them.
         *
         * Flat register (§3.10): this reader has lost trust in a product, so charm reads as sales.
         */
        migration: {
            title: 'If the counter has already stopped you today',
            quote: 'Add as many expenses as you need without hitting a limit (free users can add up to 4 expenses each day).',
            quoteNote: "From Splitwise's help centre, kb.splitwise.com, July 2026.",
            body: [
                'That is Splitwise describing its own free tier. The counter resets and you can add again tomorrow, which is no help tonight.',
                'A group does not have to move its history to carry on. Start a room, paste the link into the group chat, and put the rest of today in there. There is no account to make, so nobody in the group has to sign up before the next expense goes in. What is already in Splitwise stays in Splitwise and stays correct.',
                'Running two ledgers for one trip is worth it for the days the counter is in the way and not much longer. A group at the start of a week away is better off opening the room on day one, and a group that would rather carry the open balances over than start from today should do that in one sitting.',
            ],
            /**
             * Appended to the second paragraph, and only where the importer exists. With the flag
             * off the section must still read correctly, so the promise cannot sit in `body`.
             */
            importSentence:
                'If you would rather bring the history across, export the group from Splitwise as a spreadsheet and drop the file on the import page.',
            moreHref: '/splitwise-daily-limit',
            moreLabel: 'What the daily cap does, and how to move a group mid-trip',
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
                    split: 'Built in and free forever.',
                    other: 'Currency conversion is sold as a Pro feature.',
                },
                {
                    feature: 'Cost',
                    split: 'Free forever, with no paid tier to upgrade to.',
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
            body: 'Splitwise scans receipts, does card imports and draws charts, and it has apps in both stores. Split does none of that, on purpose. Split is for the trip, the dinner, the weekend — one group, one link, cleared and forgotten.',
        },
        features: {
            title: 'What you get',
            items: [
                {
                    title: 'One link, no accounts',
                    body: 'The link is the room. Anyone who has it is in, so keep it in the group chat and not somewhere public.',
                },
                {
                    title: 'Twelve currencies, converted',
                    body: 'Pick what the room counts in. Add an expense in any of the twelve and Split converts it at the rate on the day, which it then keeps — editing the line later does not re-price it.',
                },
                {
                    title: 'Maths that reconciles',
                    body: 'Balances sum to zero, down to the cent, and settling up suggests a short payment plan that clears the room. Open any balance and it shows you the working.',
                },
                {
                    title: 'Everyone sees it as it happens',
                    body: 'Somebody adds the taxi on the way home and it is on everyone else’s screen before they are out of the car.',
                },
                {
                    title: 'Keeps working with no signal',
                    body: 'Expenses typed in a basement or up a mountain wait on your phone and go when the signal comes back. Recording a settle-up waits for a connection on purpose — a payment written down twice is worse than one written down late.',
                },
                {
                    title: 'English, Spanish and Portuguese',
                    body: 'The room speaks whichever of the three the phone reading it is set to. Nobody has to find a setting.',
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
                    q: 'Is it free forever?',
                    a: 'Yes. Split is free forever, with nothing to upgrade to. Peanut makes it to introduce people to Peanut, which is how Split gets paid for.',
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
                    q: 'Does it work without signal?',
                    a: 'Expenses do. Anything you type with no connection is held on your phone — up to thirty of them — and sent the moment there is one. Recording a settle-up waits for a connection on purpose, because a payment written down twice is worse than one written down late.',
                },
                {
                    q: 'Is it in Spanish or Portuguese?',
                    a: 'Yes — English, Spanish and Brazilian Portuguese, picked from whatever the phone opening the link is set to. This comparison page stays in English because that is the language it is searched in.',
                },
                {
                    q: 'Can I import my Splitwise history?',
                    a: 'Yes. Export your group from Splitwise as a spreadsheet and drop the file on peanutsplit.com/import — the expenses, who paid and the balances all come across, and you get a room link to send the group. The file is read in your browser and never uploaded.',
                    v2Only: true,
                },
                {
                    q: 'How do we get back to a room?',
                    a: 'Keep the link in the group chat so everyone can find it there. Split also saves opened rooms on this device, and you can paste a room link on the home page to add it back.',
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

    /**
     * The import page. English for the same reason the comparison page is: its <title>, its
     * description and its FAQPage JSON-LD are built from these strings at module scope, and a body
     * rendered in Spanish under English structured data is a rich-result mismatch.
     *
     * The IMPORTER ITSELF is not here — it is product surface, it is localised, and its copy lives
     * in the message catalogs under `import.*`. This block is only the frame a search engine reads.
     *
     * Keep the honesty section honest: historic FX really is converted at today's rate, and
     * settle-ups really do arrive as expenses. Both are stated here before anyone uploads anything.
     */
    importPage: {
        meta: {
            title: 'Import your Splitwise group — free forever, no account',
            description:
                'Move a Splitwise group to Peanut Split in one step: export the group as a spreadsheet, drop the file in, and get a shareable room with the expenses and balances already in it.',
        },
        hero: {
            eyebrow: 'splitwise import',
            title: 'Bring your group’s history with you',
            body: 'Switching splitters normally means abandoning everything you already logged. Export your Splitwise group as a spreadsheet, drop it here, and Split rebuilds it — every expense, who paid, and the balances you had a minute ago — as a room link you can paste into the group chat.',
        },
        honest: {
            title: 'What to expect',
            items: [
                {
                    title: 'The file never leaves your device',
                    body: 'It is read in your browser. What reaches us is the list of expenses, not the document — and nobody has to make an account for any of it.',
                },
                {
                    title: 'Balances match to the cent',
                    body: 'Splitwise records what each person came out ahead or behind by, and that is what the imported room reproduces. If your export has a “Total balance” row, compare it.',
                },
                {
                    title: 'Old exchange rates are not in the file',
                    body: 'A group that spent in more than one currency is converted at today’s rate, because Splitwise does not export the rate it used on the day. Single-currency groups are unaffected.',
                },
                {
                    title: 'Settle-ups arrive as expenses',
                    body: 'Payments between people come across as rows in the history rather than as recorded settlements. The balances come out identical either way.',
                },
            ],
        },
        faq: {
            title: 'Questions people actually ask',
            items: [
                {
                    q: 'How do I export my group from Splitwise?',
                    a: 'Open the group on the web, use the group settings menu, and choose “Export as spreadsheet”. Splitwise emails or downloads a .csv file — that is the file to drop here.',
                },
                {
                    q: 'Does everyone in my group have to sign up?',
                    a: 'No. The import creates a room and a link. Everyone else opens the link, picks their name from the list you imported, and they are in.',
                },
                {
                    q: 'Is my data uploaded anywhere?',
                    a: 'The .csv is opened and read by your own browser. We receive the expenses it contains in order to build the room, and never the file itself.',
                },
                {
                    q: 'What if the file has something we cannot read?',
                    a: 'You see it before anything is created. The preview lists every row that was skipped and why, and nothing is written until you press the button.',
                },
                {
                    q: 'How big a group can I import?',
                    a: 'Up to 20 people and 500 expenses. Groups larger than that are not what Split is for — it is built for a trip, a flat or a dinner.',
                },
            ],
        },
        cta: {
            title: 'Or just start fresh',
            body: 'If the old balances are already settled, a new room takes ten seconds.',
            button: 'Start a split',
        },
    },
} as const
