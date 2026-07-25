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
