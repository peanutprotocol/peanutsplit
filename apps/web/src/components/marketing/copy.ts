/**
 * All landing-page strings, in one place.
 *
 * i18n: SPEC calls for next-intl with `en` / `es` (es-419 tone) / `pt-BR`. This pass ships
 * English only. Every user-visible string on the marketing surface lives in this object and
 * nowhere else, so extraction is a mechanical move into `messages/en.json` — the key paths
 * below are already namespaced to survive that translation verbatim (`marketing.hero.title`…).
 *
 * Rules for whoever edits this: keep it honest. Free forever is a promise, not a growth line;
 * "settle however you like" must never imply the Peanut path is safer than cash.
 */
export const marketingCopy = {
    hero: {
        eyebrow: 'no app · no signup · free forever',
        // Rendered as two stacked Knerd lines.
        titleTop: 'SPLIT',
        titleBottom: 'ANYTHING',
        subtitle:
            'Trips, dinners, flatmates. Share one link — everyone adds what they paid, and we work out who owes who.',
        cta: 'Start a split',
        ctaHint: 'Takes ten seconds. No email, no password, no download.',
        mascotAlt: 'Peanut waving hello',
    },
    rooms: {
        title: 'Your rooms',
        subtitle: 'Saved on this device.',
        openLabel: 'Open room',
        // {count} is substituted at render time.
        moreLabel: 'and {count} more',
    },
    how: {
        title: 'How it works',
        steps: [
            {
                n: '1',
                title: 'Start a split',
                body: 'Name it, pick an emoji and a currency. Ski trip, flat bills, Tuesday dinner.',
            },
            {
                n: '2',
                title: 'Share the link',
                body: 'Drop it in the group chat. Nobody installs anything or makes an account.',
            },
            {
                n: '3',
                title: 'Everyone adds expenses',
                body: 'Balances update live, and the maths reconciles to the cent — on screen, every time.',
            },
        ],
    },
    honesty: {
        title: 'The honest bit',
        items: [
            {
                title: 'Free forever',
                body: 'No fees, no premium tier, nothing to upgrade to.',
            },
            {
                title: 'No account needed',
                body: 'No email, no password, no ID checks. The link is the key — keep it in the group.',
            },
            {
                title: 'Settle however you like',
                body: 'Cash, bank transfer, or whatever app you already use. We just record it.',
            },
        ],
    },
    footer: {
        poweredByPrefix: 'powered by',
        poweredByBrand: 'Peanut',
        poweredByHref: 'https://peanut.me?utm_source=split&utm_medium=footer',
        compareLink: 'Splitwise alternative',
    },
    /**
     * The one SEO page (decision log, 2026-07-25: "LP + one strong Splitwise alternative page").
     * Every claim about Splitwise here was checked against their own site in July 2026 and is
     * quoted rather than characterised. Don't add a claim you haven't opened the page for, and
     * don't add one that needs updating when they change a price.
     */
    compare: {
        meta: {
            title: 'Splitwise alternative — split expenses without an account',
            description:
                'A free Splitwise alternative with no signup: share one link and everyone in the group adds what they paid. No app, no account, no paid tier.',
        },
        hero: {
            eyebrow: 'splitwise alternative',
            title: 'Split the bill without making everyone sign up',
            body: 'Splitwise works. It also asks every person in the group to make an account before they can add a single expense, and that is where most groups quietly give up. Peanut Split is a link. Send it, people type a name, everyone adds what they paid.',
            cta: 'Start a split',
            ctaHint: 'Takes ten seconds. No email, no password, no download.',
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
                    feature: 'Cost',
                    split: 'Free, with no paid tier to upgrade to.',
                    other: 'Free, plus a Splitwise Pro tier their own page sells as “no limits and no ads”.',
                },
            ],
            footnote: 'Splitwise claims checked against splitwise.com in July 2026.',
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
    install: {
        title: 'Add Split to your home screen',
        body: 'Opens instantly, works like an app. No store, no account.',
        cta: 'Add to home screen',
        dismiss: 'Not now',
        ios: {
            title: 'Add Split to your home screen',
            body: 'Two taps in Safari and Split lives on your home screen like an app.',
            steps: [
                'Tap the Share button in the Safari toolbar.',
                'Scroll down and choose “Add to Home Screen”.',
                'Tap “Add”. That’s it.',
            ],
            done: 'Got it',
        },
    },
} as const
